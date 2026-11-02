use std::net::IpAddr;
use std::time::Duration;

use anyhow::{anyhow, Result};
use chrono::Utc;
use reqwest::{redirect::Policy, Client, StatusCode};
use url::Url;
use uuid::Uuid;

use crate::evidence::{self, EvidenceEnv, PendingEvidence};
use crate::model::{
    EvidenceRecord, ExplorationRecord, FailureBundle, FeatureArea, ObservedPage, Project,
    RunRecord, TenantScope, TestCase,
};

const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum RunnerError {
    #[error("target URL is invalid: {0}")]
    InvalidTarget(String),
    #[error("target is not reachable: {0}")]
    Request(String),
    #[error("target response was too large (maximum is {MAX_BODY_BYTES} bytes)")]
    ResponseTooLarge,
}

pub async fn explore(project: &Project) -> Result<ExplorationRecord> {
    let started_at = Utc::now();
    let observation = fetch_target(&project.url).await?;
    let finished_at = Utc::now();
    let feature_areas = feature_areas(&observation.text);
    let observed_count = feature_areas.iter().filter(|area| area.observed).count();
    let coverage = if feature_areas.is_empty() {
        100
    } else {
        ((observed_count * 100) / feature_areas.len()) as u8
    };
    Ok(ExplorationRecord {
        id: format!("exploration-{}", short_id()),
        tenant: TenantScope::default(),
        project_id: project.id.clone(),
        status: if observation.status.is_success() {
            "completed".to_owned()
        } else {
            "failed".to_owned()
        },
        target: project.url.clone(),
        started_at,
        finished_at,
        pages: vec![ObservedPage {
            url: project.url.clone(),
            title: observation.title,
            status_code: observation.status.as_u16(),
            response_time_ms: observation.elapsed_ms,
            content_type: observation.content_type,
        }],
        feature_areas,
        coverage,
        evidence_level: "live-http".to_owned(),
    })
}

pub async fn run_project(
    project: &Project,
    tests: &[TestCase],
    trigger: &str,
    env: &EvidenceEnv,
) -> Result<RunRecord> {
    let started_at = Utc::now();
    let mut evidence = Vec::with_capacity(tests.len());
    let mut failures = Vec::new();
    // A later case can still abort the run (`?` below), and the run is only
    // persisted after it returns. Files written for earlier cases are deleted
    // unless the finished record takes ownership of them.
    let mut pending = PendingEvidence::new(env.dir.as_deref());
    for test in tests {
        let request_url = request_url_for_test(project, test)?;
        let observation = fetch_target_with_method(&request_url, &test.request_method).await?;
        let evidence_id = format!("evidence-{}", short_id());
        let browser = if test.test_type == "API" {
            BrowserEvidence::not_applicable()
        } else {
            pending.track(&evidence_id);
            capture_browser_evidence(env, &evidence_id, &request_url).await
        };
        // UI signals and assertions may appear only after client rendering, so
        // they match against the served body and the rendered browser tree.
        let matched_text = match browser.rendered_text.as_deref() {
            Some(rendered) => format!("{} {rendered}", observation.text),
            None => observation.text.clone(),
        };
        let passed = status_matches(&observation, test)
            && (signal_for_test(test).is_none()
                || signal_for_test(test).is_some_and(|signal| matched_text.contains(&signal)));
        let assertions_passed = test
            .response_assertions
            .iter()
            .all(|assertion| assertion_matches(&matched_text, assertion));
        let performance_passed = test
            .max_response_time_ms
            .is_none_or(|budget| observation.elapsed_ms <= budget);
        let passed = passed && assertions_passed && performance_passed;
        let evidence_item = EvidenceRecord {
            id: evidence_id.clone(),
            test_id: test.id.clone(),
            url: request_url,
            status_code: observation.status.as_u16(),
            title: observation.title.clone(),
            response_time_ms: observation.elapsed_ms,
            content_type: observation.content_type.clone(),
            text_preview: observation.preview.clone(),
            screenshot_available: browser.screenshot,
            dom_snapshot_available: browser.dom_snapshot,
            level: browser.level.to_owned(),
            observed_at: Utc::now(),
            browser_note: browser.note.clone(),
            rendered_url: browser.rendered_url.clone(),
            rendered_title: browser.rendered_title.clone(),
        };
        if !passed {
            let root_cause = if !status_matches(&observation, test) {
                if test.test_type == "API" {
                    format!("http_expected_{}", test.expected_status)
                } else {
                    format!("http_{}", observation.status.as_u16())
                }
            } else if !assertions_passed {
                "response_assertion_missing".to_owned()
            } else if !performance_passed {
                "performance_budget_exceeded".to_owned()
            } else {
                "coverage_signal_missing".to_owned()
            };
            let suggested_fix = if !status_matches(&observation, test) {
                format!(
                    "Expected HTTP status {} for this case, then rerun against the target.",
                    test.expected_status
                )
            } else if !assertions_passed {
                "Refine the response assertions or the target contract, then rerun against the target.".to_owned()
            } else if let Some(budget) = test.max_response_time_ms {
                format!(
                    "Reduce the response time below the {} ms budget, then rerun.",
                    budget
                )
            } else {
                "Refine the plan with a page-specific signal or selector, then rerun against the target.".to_owned()
            };
            failures.push(FailureBundle {
                id: format!("failure-{}", short_id()),
                test_id: test.id.clone(),
                title: format!("{} needs review", test.name),
                failed_step: if status_matches(&observation, test) {
                    "Verify the expected journey evidence".to_owned()
                } else {
                    "Open the live target".to_owned()
                },
                root_cause,
                suggested_fix,
                source: test.source.clone(),
                evidence_id: evidence_id.clone(),
                screenshot_available: evidence_item.screenshot_available,
                dom_snapshot: evidence_item
                    .dom_snapshot_available
                    .then(|| format!("/evidence/{evidence_id}")),
                status: "open".to_owned(),
                healed_at: None,
                healing_note: None,
            });
        }
        evidence.push(evidence_item);
    }
    pending.keep();
    let passed = tests.len().saturating_sub(failures.len());
    let failed = failures.len();
    let finished_at = Utc::now();
    let duration_ms = finished_at
        .signed_duration_since(started_at)
        .num_milliseconds()
        .max(0) as u64;
    Ok(RunRecord {
        id: format!("run-{}", short_id()),
        tenant: TenantScope::default(),
        project_id: project.id.clone(),
        status: "completed".to_owned(),
        verdict: if failed == 0 { "passed" } else { "attention" }.to_owned(),
        trigger: trigger.to_owned(),
        scope: "project".to_owned(),
        target_test_id: None,
        started_at,
        finished_at,
        duration_ms,
        passed,
        failed,
        skipped: 0,
        coverage: if tests.is_empty() {
            0
        } else {
            ((passed * 100) / tests.len()) as u8
        },
        summary: if failed == 0 {
            format!("{} live checks passed against {}.", passed, project.url)
        } else {
            format!(
                "{} checks passed and {} need attention against {}.",
                passed, failed, project.url
            )
        },
        evidence_level: run_evidence_level(&evidence).to_owned(),
        evidence,
        failures,
        exploration_id: None,
    })
}

pub const LEVEL_HTTP: &str = "live-http";
pub const LEVEL_BROWSER: &str = "live-browser";
pub const LEVEL_HTTP_FALLBACK: &str = "live-http-fallback";

/// What the browser lane produced for one UI case.
struct BrowserEvidence {
    level: &'static str,
    screenshot: bool,
    dom_snapshot: bool,
    note: Option<String>,
    rendered_text: Option<String>,
    rendered_url: Option<String>,
    rendered_title: Option<String>,
}

impl BrowserEvidence {
    fn not_applicable() -> Self {
        Self::fallback(LEVEL_HTTP, None)
    }

    fn fallback(level: &'static str, note: Option<String>) -> Self {
        Self {
            level,
            screenshot: false,
            dom_snapshot: false,
            note,
            rendered_text: None,
            rendered_url: None,
            rendered_title: None,
        }
    }
}

async fn capture_browser_evidence(
    env: &EvidenceEnv,
    evidence_id: &str,
    url: &str,
) -> BrowserEvidence {
    let (Some(browser), Some(dir), Some(seal)) =
        (env.browser.as_ref(), env.dir.as_deref(), env.seal.as_ref())
    else {
        return BrowserEvidence::fallback(
            LEVEL_HTTP_FALLBACK,
            Some(
                "Browser evidence unavailable: this Checks process is not connected to the Ryu browser.control capability."
                    .to_owned(),
            ),
        );
    };
    let capture = match browser.capture(url).await {
        Ok(capture) => capture,
        Err(error) => {
            return BrowserEvidence::fallback(
                LEVEL_HTTP_FALLBACK,
                Some(browser_fallback_note(url, &error)),
            );
        }
    };
    match evidence::write(dir, seal, evidence_id, &capture) {
        Ok((screenshot, dom_snapshot)) => BrowserEvidence {
            level: LEVEL_BROWSER,
            screenshot,
            dom_snapshot,
            note: (!dom_snapshot)
                .then(|| "DOM snapshot exceeded the retained size limit.".to_owned()),
            rendered_text: Some(capture.rendered_text),
            rendered_url: capture.final_url,
            rendered_title: capture.title,
        },
        Err(error) => {
            tracing::warn!("checks: retaining browser evidence failed: {error:#}");
            BrowserEvidence::fallback(
                LEVEL_HTTP_FALLBACK,
                Some(
                    "Browser evidence was captured but could not be retained on this node."
                        .to_owned(),
                ),
            )
        }
    }
}

/// Explain why a UI case fell back to HTTP. The Ryu Browser refuses localhost
/// and loopback addresses for every caller (its navigation guard and network
/// proxy block them), so an explicit localhost target can pass the HTTP lane
/// but never yields browser evidence; say so instead of only echoing the error.
fn browser_fallback_note(target: &str, error: &crate::browser::BrowserError) -> String {
    if is_loopback_target(target) {
        format!(
            "Browser evidence is not available for localhost or loopback targets: the Ryu Browser does not open them, so this case was checked over HTTP only ({error})."
        )
    } else {
        error.to_string()
    }
}

/// An explicit `localhost` / loopback-literal target (the only local hosts the
/// HTTP lane accepts).
fn is_loopback_target(target: &str) -> bool {
    let Ok(parsed) = Url::parse(target) else {
        return false;
    };
    match parsed.host() {
        Some(url::Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    }
}

/// The run-level label is the weakest truthful summary of its records.
fn run_evidence_level(evidence: &[EvidenceRecord]) -> &'static str {
    let browser = evidence
        .iter()
        .filter(|item| item.level == LEVEL_BROWSER)
        .count();
    let fallback = evidence
        .iter()
        .any(|item| item.level == LEVEL_HTTP_FALLBACK);
    if browser > 0 && browser == evidence.len() {
        LEVEL_BROWSER
    } else if browser > 0 {
        "mixed"
    } else if fallback {
        LEVEL_HTTP_FALLBACK
    } else {
        LEVEL_HTTP
    }
}

struct Observation {
    status: StatusCode,
    title: Option<String>,
    content_type: Option<String>,
    elapsed_ms: u64,
    text: String,
    preview: String,
}

struct ValidatedTarget {
    url: Url,
    addresses: Vec<std::net::SocketAddr>,
}

async fn fetch_target(raw_url: &str) -> Result<Observation> {
    fetch_target_with_method(raw_url, "GET").await
}

async fn fetch_target_with_method(raw_url: &str, method: &str) -> Result<Observation> {
    let target = validate_target_with_addresses(raw_url).await?;
    let mut client_builder = Client::builder()
        // Connect only to the addresses screened below. An ambient proxy can
        // bypass that DNS/IP decision and can observe user target URLs.
        .no_proxy()
        .timeout(Duration::from_secs(20))
        .redirect(Policy::none())
        .user_agent("Ryu Checks/0.1");
    if let Some(host) = target.url.host_str() {
        // Reuse every address screened above. The URL still carries the
        // original hostname for HTTP Host/TLS SNI, but DNS cannot change the
        // destination between validation and connection.
        client_builder = client_builder.resolve_to_addrs(host, &target.addresses);
    }
    let client = client_builder
        .build()
        .map_err(|error| anyhow!("build target client: {error}"))?;
    let started = std::time::Instant::now();
    let request = match method.to_ascii_uppercase().as_str() {
        "DELETE" => client.delete(target.url.clone()),
        "PATCH" => client.patch(target.url.clone()),
        "POST" => client.post(target.url.clone()),
        "PUT" => client.put(target.url.clone()),
        _ => client.get(target.url.clone()),
    };
    let response = request
        .send()
        .await
        .map_err(|error| RunnerError::Request(error.to_string()))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BODY_BYTES as u64)
    {
        return Err(RunnerError::ResponseTooLarge.into());
    }
    let mut body = Vec::new();
    let mut response = response;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| RunnerError::Request(error.to_string()))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_BODY_BYTES {
            return Err(RunnerError::ResponseTooLarge.into());
        }
        body.extend_from_slice(&chunk);
    }
    let raw = String::from_utf8_lossy(&body).into_owned();
    let text = strip_markup(&raw);
    Ok(Observation {
        status,
        title: extract_title(&raw),
        content_type,
        elapsed_ms: started.elapsed().as_millis() as u64,
        preview: text.chars().take(800).collect(),
        text: text.to_ascii_lowercase(),
    })
}

fn request_url_for_test(project: &Project, test: &TestCase) -> Result<String> {
    let Some(path) = test.request_path.as_deref() else {
        return Ok(project.url.clone());
    };
    let base =
        Url::parse(&project.url).map_err(|error| RunnerError::InvalidTarget(error.to_string()))?;
    let joined = if path.starts_with('/') {
        let mut joined = base;
        joined.set_path(path);
        joined
    } else {
        base.join(path)
            .map_err(|error| RunnerError::InvalidTarget(error.to_string()))?
    };
    Ok(joined.to_string())
}

fn status_matches(observation: &Observation, test: &TestCase) -> bool {
    if test.test_type == "API" {
        observation.status.as_u16() == test.expected_status
    } else {
        observation.status.is_success()
    }
}

fn assertion_matches(text: &str, assertion: &str) -> bool {
    let normalized = assertion.trim().to_ascii_lowercase();
    let expected = normalized
        .strip_prefix("contains:")
        .or_else(|| normalized.strip_prefix("json:"))
        .unwrap_or(&normalized)
        .trim();
    !expected.is_empty() && text.contains(expected)
}

async fn validate_target_with_addresses(raw_url: &str) -> Result<ValidatedTarget> {
    let url = Url::parse(raw_url.trim())
        .map_err(|error| RunnerError::InvalidTarget(error.to_string()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(RunnerError::InvalidTarget(
            "only http and https targets are supported".to_owned(),
        )
        .into());
    }
    if url.username() != "" || url.password().is_some() || url.fragment().is_some() {
        return Err(RunnerError::InvalidTarget(
            "credentials and fragments are not allowed in a target URL".to_owned(),
        )
        .into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| RunnerError::InvalidTarget("target URL has no host".to_owned()))?;
    if host.eq_ignore_ascii_case("metadata.google.internal")
        || host.ends_with(".local")
        || host.ends_with(".internal")
    {
        return Err(RunnerError::InvalidTarget(
            "internal metadata and local discovery hostnames are blocked".to_owned(),
        )
        .into());
    }
    let port =
        url.port_or_known_default().unwrap_or_else(
            || {
                if url.scheme() == "https" {
                    443
                } else {
                    80
                }
            },
        );
    let addresses: Vec<std::net::SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map(|addresses| addresses.collect())
        .map_err(|error| {
            RunnerError::InvalidTarget(format!("host could not be resolved: {error}"))
        })?;
    let mut found = false;
    let allow_loopback = host.eq_ignore_ascii_case("localhost")
        || host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback());
    for address in &addresses {
        found = true;
        if is_disallowed_ip(address.ip()) && !(allow_loopback && address.ip().is_loopback()) {
            return Err(RunnerError::InvalidTarget(
                "private, link-local, and loopback targets are blocked except an explicit localhost target".to_owned(),
            )
            .into());
        }
    }
    if !found {
        return Err(RunnerError::InvalidTarget("target host did not resolve".to_owned()).into());
    }
    Ok(ValidatedTarget { url, addresses })
}

fn is_disallowed_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(value) => {
            value.is_private()
                || value.is_loopback()
                || value.is_link_local()
                || value.is_unspecified()
                || value.is_broadcast()
                || value.is_multicast()
                || value.octets()[0] == 0
                || value.octets()[0] >= 224
                || (value.octets()[0] == 100 && (64..=127).contains(&value.octets()[1]))
                || (value.octets()[0] == 192 && value.octets()[1] == 0)
                || (value.octets()[0] == 198 && (18..=19).contains(&value.octets()[1]))
        }
        IpAddr::V6(value) => {
            value
                .to_ipv4()
                .is_some_and(|mapped| is_disallowed_ip(IpAddr::V4(mapped)))
                || value.is_loopback()
                || value.is_unspecified()
                || value.is_unique_local()
                || value.is_unicast_link_local()
                || value.is_multicast()
        }
    }
}

fn extract_title(raw: &str) -> Option<String> {
    let lower = raw.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let open_end = lower[start..].find('>')? + start + 1;
    let close = lower[open_end..].find("</title>")? + open_end;
    let title = strip_markup(&raw[open_end..close]);
    (!title.is_empty()).then_some(title.chars().take(160).collect())
}

fn strip_markup(raw: &str) -> String {
    let mut output = String::with_capacity(raw.len());
    let mut in_tag = false;
    for character in raw.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(character),
            _ => {}
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn signal_for_test(test: &TestCase) -> Option<String> {
    let normalized = format!("{} {}", test.name, test.feature).to_ascii_lowercase();
    [
        ("sign", "sign"),
        ("auth", "auth"),
        ("search", "search"),
        ("find", "find"),
        ("checkout", "checkout"),
        ("billing", "billing"),
        ("dashboard", "dashboard"),
        ("workspace", "workspace"),
    ]
    .iter()
    .find_map(|(needle, signal)| normalized.contains(needle).then(|| (*signal).to_owned()))
}

fn feature_areas(text: &str) -> Vec<FeatureArea> {
    [
        ("Authentication", "sign"),
        ("Discovery", "search"),
        ("Checkout", "checkout"),
        ("Workspace", "workspace"),
    ]
    .into_iter()
    .map(|(name, signal)| FeatureArea {
        name: name.to_owned(),
        signal: signal.to_owned(),
        observed: text.contains(signal),
    })
    .collect()
}

fn short_id() -> String {
    Uuid::new_v4().simple().to_string()[..12].to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_markup_and_extracts_title() {
        let html = "<html><title> Demo </title><body>Hello <b>Ryu</b></body></html>";
        assert_eq!(extract_title(html).as_deref(), Some("Demo"));
        assert_eq!(strip_markup(html), "Demo Hello Ryu");
    }

    #[test]
    fn loopback_targets_get_a_precise_browser_fallback_note() {
        let refused = crate::browser::BrowserError::Failed(
            "browser.navigate: 500 browser navigation cannot target private or local hosts"
                .to_owned(),
        );
        for url in [
            "http://localhost:3000/",
            "http://127.0.0.1:8080/app",
            "http://[::1]/",
        ] {
            let note = browser_fallback_note(url, &refused);
            assert!(note.contains("localhost or loopback"), "{url}: {note}");
            assert!(note.contains("cannot target private"), "{url}: {note}");
        }
        assert_eq!(
            browser_fallback_note("https://example.test/", &refused),
            refused.to_string()
        );
    }

    #[test]
    fn blocks_private_and_metadata_ips() {
        assert!(is_disallowed_ip("127.0.0.1".parse().expect("ip")));
        assert!(is_disallowed_ip("10.0.0.2".parse().expect("ip")));
        assert!(is_disallowed_ip(
            "::ffff:169.254.169.254"
                .parse()
                .expect("mapped metadata ip")
        ));
        assert!(is_disallowed_ip(
            "fe80::1".parse().expect("ipv6 link-local ip")
        ));
        assert!(is_disallowed_ip("::1".parse().expect("ip")));
        assert!(!is_disallowed_ip("8.8.8.8".parse().expect("ip")));
    }
}

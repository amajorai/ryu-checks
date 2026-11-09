//! Retained browser evidence files.
//!
//! Screenshots and DOM snapshots are binary/large, so they live beside the JSON
//! store (`<data dir>/checks-evidence/<evidence-id>.{png,dom.json}`) rather than in
//! `checks.json`. The run record carries only the availability flags; the files
//! are served back through the app's own authenticated mount
//! (`GET /api/checks/evidence/:id`) after a tenant check on the owning run.
//!
//! At rest both files are write-once `RYU-SF01` sealed files (store
//! `checks-evidence`, AAD bound to the evidence id and the file kind), written
//! through an owner-only temp file and a rename. Legacy plaintext files still
//! read and are sealed in place by [`seal_legacy_files`] (verified before the
//! original is replaced). The file names keep the evidence id: ids are random
//! and carry no content.

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use anyhow::{Context, Result};
use base64::Engine as _;
use serde_json::Value;

use ryu_crypto::sealed_file::{is_sealed_file, seal_file_in_place, SealedFileReader};
use ryu_crypto::{ContentContext, SealedFileWriter};

use crate::browser::{BrowserCapture, BrowserClient, MAX_DOM_SNAPSHOT_BYTES};
use crate::seal_keys::StoreSeal;

/// The registered content-store name of the evidence files (never rename).
pub const STORE: &str = "checks-evidence";

pub const EVIDENCE_DIR_NAME: &str = "checks-evidence";
/// Newest runs whose screenshots and DOM snapshots stay on disk. Older runs keep
/// their records, but their browser files are deleted and their flags cleared.
pub const MAX_RETAINED_EVIDENCE_RUNS: usize = 50;
/// Total bytes of retained evidence files across all runs (newest kept first).
pub const MAX_RETAINED_EVIDENCE_BYTES: u64 = 512 * 1024 * 1024;
/// Evidence files no stored run references are deleted once they are this old.
/// The grace period keeps files that an in-flight run (in this process or in the
/// MCP/CLI process sharing the store) wrote but has not saved yet.
pub const UNREFERENCED_EVIDENCE_GRACE: Duration = Duration::from_secs(24 * 60 * 60);

/// Everything a run needs to produce browser evidence. `browser: None` means the
/// capability is not reachable from this process; UI cases then fall back to the
/// HTTP-only check with truthful flags.
#[derive(Clone, Default)]
pub struct EvidenceEnv {
    pub browser: Option<BrowserClient>,
    pub dir: Option<PathBuf>,
    /// How evidence files are sealed (`None`: nothing is written to disk).
    pub seal: Option<StoreSeal>,
}

impl EvidenceEnv {
    pub fn from_env(dir: PathBuf, seal: StoreSeal) -> Self {
        Self {
            browser: BrowserClient::from_env(),
            dir: Some(dir),
            seal: Some(seal),
        }
    }

    /// HTTP-only evidence (no browser, nothing written to disk).
    pub fn http_only() -> Self {
        Self::default()
    }
}

/// Evidence ids are minted by the runner (`evidence-<hex>`). Anything else is
/// rejected before it can become a path component.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

pub fn screenshot_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.png"))
}

pub fn dom_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.dom.json"))
}

/// The AAD of one evidence file: its evidence id and kind (`png` or `dom`).
pub fn file_ctx(id: &str, kind: &str) -> ContentContext {
    ContentContext::new("file")
        .with("evidence_id", id)
        .with("kind", kind)
}

/// Write both files. Returns `(screenshot_written, dom_written)`.
pub fn write(
    dir: &Path,
    seal: &StoreSeal,
    id: &str,
    capture: &BrowserCapture,
) -> Result<(bool, bool)> {
    if !valid_id(id) {
        anyhow::bail!("invalid evidence id");
    }
    seal.ensure_writable()?;
    fs::create_dir_all(dir)
        .with_context(|| format!("create evidence directory {}", dir.display()))?;
    let written = write_files(dir, seal, id, capture);
    if written.is_err() {
        // Never leave a half-written pair behind: the record will claim neither.
        remove(dir, [id.to_owned()]);
    }
    written
}

fn write_files(
    dir: &Path,
    seal: &StoreSeal,
    id: &str,
    capture: &BrowserCapture,
) -> Result<(bool, bool)> {
    write_private(
        &screenshot_path(dir, id),
        seal,
        &file_ctx(id, "png"),
        &capture.screenshot_png,
    )?;
    let dom = serde_json::to_vec(&capture.dom_snapshot)?;
    let dom_written = if dom.len() <= MAX_DOM_SNAPSHOT_BYTES {
        write_private(&dom_path(dir, id), seal, &file_ctx(id, "dom"), &dom)?;
        true
    } else {
        false
    };
    Ok((true, dom_written))
}

/// Write one evidence file: sealed (`RYU-SF01`) through an owner-only temp
/// file and a rename; in compat mode the plaintext bytes, as before.
fn write_private(path: &Path, seal: &StoreSeal, ctx: &ContentContext, bytes: &[u8]) -> Result<()> {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temp = path.with_file_name(format!(".{name}.{}.tmp", uuid::Uuid::new_v4().simple()));
    let written = (|| -> Result<()> {
        match seal {
            StoreSeal::Sealing(cipher) => {
                let mut writer = SealedFileWriter::create(&temp, cipher, ctx)?;
                writer.write_plain(bytes)?;
                writer.finish()?;
            }
            StoreSeal::Compat => {
                fs::write(&temp, bytes)
                    .with_context(|| format!("write evidence {}", temp.display()))?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&temp, fs::Permissions::from_mode(0o600))?;
                }
            }
            StoreSeal::Unhealthy(reason) => anyhow::bail!("{reason}"),
        }
        fs::rename(&temp, path).with_context(|| format!("write evidence {}", path.display()))
    })();
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written
}

/// Read one evidence file: sealed files are opened (and verified), legacy
/// plaintext is returned as is. `None` when the file does not exist.
fn read_file(path: &Path, seal: &StoreSeal, ctx: &ContentContext) -> Result<Option<Vec<u8>>> {
    match is_sealed_file(path) {
        Ok(true) => {
            let Some(cipher) = seal.cipher() else {
                anyhow::bail!("this evidence is sealed and this process has no key for it");
            };
            let mut reader = SealedFileReader::open_path(path, cipher, ctx)?;
            let mut out = Vec::with_capacity(reader.plaintext_len() as usize);
            io::Read::read_to_end(&mut reader, &mut out)?;
            Ok(Some(out))
        }
        Ok(false) => Ok(Some(fs::read(path)?)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Read retained files as `(base64 PNG, DOM snapshot)`; either may be absent.
pub fn read(dir: &Path, seal: &StoreSeal, id: &str) -> Result<(Option<String>, Option<Value>)> {
    if !valid_id(id) {
        anyhow::bail!("invalid evidence id");
    }
    let screenshot = read_file(&screenshot_path(dir, id), seal, &file_ctx(id, "png"))?
        .map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes));
    let dom = match read_file(&dom_path(dir, id), seal, &file_ctx(id, "dom"))? {
        Some(bytes) => Some(serde_json::from_slice(&bytes)?),
        None => None,
    };
    Ok((screenshot, dom))
}

/// Whether any retained evidence file is sealed (a store that holds sealed
/// data must not fall back to compat mode).
pub fn any_sealed(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let name = entry.file_name();
        name.to_str().and_then(evidence_id_of).is_some()
            && is_sealed_file(&entry.path()).unwrap_or(false)
    })
}

/// Seal every legacy plaintext evidence file in place, one at a time: each
/// sealed copy is verified before it replaces the original, and a file that
/// fails (removed meanwhile, short on disk space) is left as it is and retried
/// at the next start. Returns `(sealed, failed)`.
pub fn seal_legacy_files(dir: &Path, seal: &StoreSeal) -> (usize, usize) {
    let Some(cipher) = seal.cipher() else {
        return (0, 0);
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return (0, 0);
    };
    let (mut sealed, mut failed) = (0, 0);
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        let Some(id) = evidence_id_of(name) else {
            continue;
        };
        let kind = if name.ends_with(".dom.json") {
            "dom"
        } else {
            "png"
        };
        match seal_file_in_place(&entry.path(), cipher, &file_ctx(id, kind)) {
            Ok(ryu_crypto::sealed_file::SealInPlace::Sealed { .. }) => sealed += 1,
            Ok(_) => {}
            Err(error) => {
                failed += 1;
                tracing::warn!(
                    "checks: sealing evidence {name} failed (retried next start): {error:#}"
                );
            }
        }
    }
    (sealed, failed)
}

/// Bytes currently on disk for one evidence id (missing files count as zero).
pub fn retained_bytes(dir: &Path, id: &str) -> u64 {
    if !valid_id(id) {
        return 0;
    }
    [screenshot_path(dir, id), dom_path(dir, id)]
        .iter()
        .filter_map(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len())
        .sum()
}

/// Walk `ids` newest first and return those whose files no longer fit within
/// `max_bytes` once every newer id is accounted for.
pub fn over_budget(dir: &Path, ids: &[String], max_bytes: u64) -> Vec<String> {
    let mut total = 0_u64;
    let mut evicted = Vec::new();
    for id in ids {
        let size = retained_bytes(dir, id);
        if total.saturating_add(size) > max_bytes {
            evicted.push(id.clone());
        } else {
            total = total.saturating_add(size);
        }
    }
    evicted
}

/// Remove retained files for evidence ids that no longer have a run.
pub fn remove(dir: &Path, ids: impl IntoIterator<Item = String>) {
    for id in ids.into_iter().filter(|id| valid_id(id)) {
        for path in [screenshot_path(dir, &id), dom_path(dir, &id)] {
            if let Err(error) = fs::remove_file(&path) {
                if error.kind() != io::ErrorKind::NotFound {
                    tracing::warn!(
                        "checks: removing evidence {} failed: {error}",
                        path.display()
                    );
                }
            }
        }
    }
}

/// Evidence ids a run has written files for but not yet handed to the store.
///
/// Dropping the guard deletes those files, so a run that aborts on a later case
/// (an unreachable target, an oversized body) or whose future is dropped never
/// leaves screenshots and DOM snapshots that no run record references. Call
/// [`PendingEvidence::keep`] once the run record carrying the ids exists.
pub struct PendingEvidence {
    dir: Option<PathBuf>,
    ids: Vec<String>,
}

impl PendingEvidence {
    pub fn new(dir: Option<&Path>) -> Self {
        Self {
            dir: dir.map(Path::to_path_buf),
            ids: Vec::new(),
        }
    }

    /// Record an id whose files may be written to disk.
    pub fn track(&mut self, id: &str) {
        if self.dir.is_some() {
            self.ids.push(id.to_owned());
        }
    }

    /// The run record now owns every tracked id; keep the files.
    pub fn keep(mut self) {
        self.ids.clear();
    }
}

impl Drop for PendingEvidence {
    fn drop(&mut self) {
        if let Some(dir) = self.dir.as_deref() {
            remove(dir, std::mem::take(&mut self.ids));
        }
    }
}

/// The evidence id a retained file belongs to (`<id>.png` / `<id>.dom.json`).
fn evidence_id_of(file_name: &str) -> Option<&str> {
    file_name
        .strip_suffix(".dom.json")
        .or_else(|| file_name.strip_suffix(".png"))
        .filter(|id| valid_id(id))
}

/// Delete evidence files in `dir` that no id in `referenced` owns and that were
/// last modified at least `min_age` ago. Defense in depth for files a crashed or
/// aborted run left behind; they would otherwise sit outside the retention
/// budget forever. Returns how many files were removed.
pub fn sweep_unreferenced(dir: &Path, referenced: &HashSet<&str>, min_age: Duration) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let now = SystemTime::now();
    let mut removed = 0;
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        // A temp file a crashed write left behind (`.<name>.<hex>.tmp`).
        let orphan_temp = name.starts_with('.') && name.ends_with(".tmp");
        let Some(id) = evidence_id_of(name).or(orphan_temp.then_some("")) else {
            continue;
        };
        if !orphan_temp && referenced.contains(id) {
            continue;
        }
        let old_enough = entry
            .metadata()
            .ok()
            .filter(fs::Metadata::is_file)
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age >= min_age);
        if !old_enough {
            continue;
        }
        match fs::remove_file(entry.path()) {
            Ok(()) => removed += 1,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => tracing::warn!(
                "checks: removing unreferenced evidence {} failed: {error}",
                entry.path().display()
            ),
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_like_ids() {
        assert!(valid_id("evidence-0123abcd"));
        assert!(!valid_id("../checks"));
        assert!(!valid_id("evidence/1"));
        assert!(!valid_id(""));
    }

    #[test]
    fn budget_keeps_newest_evidence_and_evicts_the_rest() {
        let dir = std::env::temp_dir().join(format!(
            "ryu-checks-evidence-budget-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&dir).unwrap();
        for (id, size) in [("evidence-a", 40), ("evidence-b", 40), ("evidence-c", 40)] {
            fs::write(screenshot_path(&dir, id), vec![0_u8; size]).unwrap();
            fs::write(dom_path(&dir, id), vec![0_u8; 10]).unwrap();
        }
        assert_eq!(retained_bytes(&dir, "evidence-a"), 50);
        let ids = ["evidence-a", "evidence-b", "evidence-c"].map(str::to_owned);
        let evicted = over_budget(&dir, &ids, 120);
        assert_eq!(evicted, ["evidence-c"]);

        remove(&dir, evicted);
        assert!(!screenshot_path(&dir, "evidence-c").exists());
        assert!(!dom_path(&dir, "evidence-c").exists());
        assert!(screenshot_path(&dir, "evidence-a").exists());
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn dropped_pending_evidence_removes_tracked_files() {
        let dir = std::env::temp_dir().join(format!(
            "ryu-checks-evidence-pending-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&dir).unwrap();
        for id in ["evidence-kept", "evidence-dropped"] {
            fs::write(screenshot_path(&dir, id), b"png").unwrap();
            fs::write(dom_path(&dir, id), b"{}").unwrap();
        }

        let mut kept = PendingEvidence::new(Some(&dir));
        kept.track("evidence-kept");
        kept.keep();
        let mut dropped = PendingEvidence::new(Some(&dir));
        dropped.track("evidence-dropped");
        drop(dropped);

        assert!(screenshot_path(&dir, "evidence-kept").exists());
        assert!(!screenshot_path(&dir, "evidence-dropped").exists());
        assert!(!dom_path(&dir, "evidence-dropped").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn sweep_removes_only_old_unreferenced_evidence_files() {
        let dir = std::env::temp_dir().join(format!(
            "ryu-checks-evidence-sweep-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&dir).unwrap();
        for id in ["evidence-live", "evidence-orphan"] {
            fs::write(screenshot_path(&dir, id), b"png").unwrap();
            fs::write(dom_path(&dir, id), b"{}").unwrap();
        }
        fs::write(dir.join("notes.txt"), b"not evidence").unwrap();
        let referenced = HashSet::from(["evidence-live"]);

        // Fresh files are inside the grace period, even when unreferenced.
        assert_eq!(
            sweep_unreferenced(&dir, &referenced, Duration::from_secs(3600)),
            0
        );
        assert!(screenshot_path(&dir, "evidence-orphan").exists());

        assert_eq!(sweep_unreferenced(&dir, &referenced, Duration::ZERO), 2);
        assert!(!screenshot_path(&dir, "evidence-orphan").exists());
        assert!(!dom_path(&dir, "evidence-orphan").exists());
        assert!(screenshot_path(&dir, "evidence-live").exists());
        assert!(dom_path(&dir, "evidence-live").exists());
        assert!(dir.join("notes.txt").exists());
        let _ = fs::remove_dir_all(dir);
    }
}

//! Core's ext-proxy forwards only the sub-paths a sidecar declares in
//! `manifest.json` (`sidecars[].http.routes`) and answers 404 for anything else.
//! A route registered in `api.rs` but missing from the manifest is therefore
//! unreachable through Core, and a declared route with no handler is a dead
//! permission entry. Keep the two lists identical.

use std::collections::BTreeSet;

use serde_json::Value;

const MANIFEST: &str = include_str!("../../manifest.json");
const API_SOURCE: &str = include_str!("../src/api.rs");
const METHODS: [&str; 5] = ["get", "post", "patch", "put", "delete"];

type Route = (String, String);

fn manifest_routes() -> BTreeSet<Route> {
    let manifest: Value = serde_json::from_str(MANIFEST).expect("manifest.json parses");
    manifest["sidecars"]
        .as_array()
        .expect("manifest declares sidecars")
        .iter()
        .flat_map(|sidecar| {
            sidecar["http"]["routes"]
                .as_array()
                .cloned()
                .unwrap_or_default()
        })
        .map(|route| {
            (
                route["method"]
                    .as_str()
                    .expect("route method")
                    .to_ascii_uppercase(),
                route["path"].as_str().expect("route path").to_owned(),
            )
        })
        .collect()
}

/// Byte index of the `)` closing a call whose `(` was just consumed.
fn closing_paren(source: &str) -> usize {
    let mut depth = 1_usize;
    let mut in_string = false;
    for (index, character) in source.char_indices() {
        match character {
            '"' => in_string = !in_string,
            '(' if !in_string => depth += 1,
            ')' if !in_string => {
                depth -= 1;
                if depth == 0 {
                    return index;
                }
            }
            _ => {}
        }
    }
    panic!("unbalanced .route( call in api.rs");
}

/// Whether `handlers` calls the axum method router `method(` as a whole word.
fn calls_method(handlers: &str, method: &str) -> bool {
    let needle = format!("{method}(");
    handlers.match_indices(&needle).any(|(index, _)| {
        handlers[..index]
            .chars()
            .next_back()
            .is_none_or(|previous| !(previous.is_ascii_alphanumeric() || previous == '_'))
    })
}

fn router_routes() -> BTreeSet<Route> {
    let mut routes = BTreeSet::new();
    let mut rest = API_SOURCE;
    while let Some(start) = rest.find(".route(") {
        rest = &rest[start + ".route(".len()..];
        let end = closing_paren(rest);
        let call = &rest[..end];
        let path = call
            .split('"')
            .nth(1)
            .expect("route path is a string literal");
        let handlers = &call[call.find(',').expect("route has a method router")..];
        let before = routes.len();
        for method in METHODS {
            if calls_method(handlers, method) {
                routes.insert((method.to_ascii_uppercase(), path.to_owned()));
            }
        }
        assert!(
            routes.len() > before,
            "no HTTP method recognised for {path}"
        );
        rest = &rest[end..];
    }
    routes
}

#[test]
fn every_api_route_is_declared_in_the_manifest() {
    let declared = manifest_routes();
    let registered = router_routes();
    assert!(
        registered.contains(&("GET".to_owned(), "/evidence/:id".to_owned())),
        "the route scan must see the evidence route"
    );
    let undeclared: Vec<_> = registered.difference(&declared).collect();
    assert!(
        undeclared.is_empty(),
        "api.rs routes missing from manifest.json http.routes (Core would 404 them): {undeclared:?}"
    );
    let unserved: Vec<_> = declared.difference(&registered).collect();
    assert!(
        unserved.is_empty(),
        "manifest.json http.routes with no api.rs handler: {unserved:?}"
    );
}

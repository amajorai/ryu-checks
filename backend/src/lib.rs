//! Node-local verification engine for `@ryu/checks`.
//!
//! The sidecar owns the durable project, plan, run, evidence, collection, and
//! schedule records. It never depends on `apps/core`; Core only registers the
//! manifest and proxies the authenticated app mount. UI cases capture a real
//! browser screenshot and DOM snapshot through the generic `browser.control`
//! capability when Core grants it; otherwise the runner reports its evidence
//! level (`live-http-fallback`) instead of pretending that an HTTP fetch is a
//! browser screenshot or a real-device run.

pub mod api;
pub mod authorization;
pub mod browser;
pub mod evidence;
pub mod model;
pub mod paths;
pub mod runner;
pub mod seal_keys;
pub mod service;
pub mod sidecar_link;
pub mod store;

pub use api::{routes, tenant_from_headers, Ctx};
pub use model::TenantContext;
pub use store::Store;

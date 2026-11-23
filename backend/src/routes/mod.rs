pub mod admin;
pub mod attendance;
pub mod auth;
pub mod dev;
pub mod files;
pub mod inspections;
pub mod messages;
pub mod notifications;
pub mod profile;
pub mod superadmin;
pub mod tasks;
pub mod uploads;

use crate::state::AppState;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(auth::router())
        .merge(profile::router())
        .merge(attendance::router())
        .merge(tasks::router())
        .merge(inspections::router())
        .merge(messages::router())
        .merge(notifications::router())
        .merge(admin::router())
        .merge(superadmin::router())
        .merge(uploads::router())
        .merge(files::router())
        .merge(dev::router())
}

/**
 * Host half of the workspace-display bundle.
 *
 * The Client module (`./client`) owns the whole feature: a "Shown workspaces"
 * section inside the sidebar's view-options menu and the per-browser choice of
 * which Workspaces the sidebar list shows. This half only keeps the bundle
 * entry loadable, so the profile can mount the package without a Host-side
 * service.
 */
export function apply() {}

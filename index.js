/**
 * Host half of the session-suspend bundle.
 *
 * The feature is Client-only: the sidebar foot, the Session rows, and the
 * workspace snapshot all live in the browser half, which is what `dsh.client`
 * composes into the web module graph. This Host entry exists so the bundle has
 * an activatable row and the Client module is loaded with it.
 */
export function apply() {}

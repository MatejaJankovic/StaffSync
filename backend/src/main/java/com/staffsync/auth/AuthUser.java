package com.staffsync.auth;

import com.staffsync.user.Role;

/**
 * The authenticated principal, built from the JWT. Inject it in controllers with
 * {@code @AuthenticationPrincipal AuthUser user}.
 */
public record AuthUser(Long id, String email, Role role) {

}

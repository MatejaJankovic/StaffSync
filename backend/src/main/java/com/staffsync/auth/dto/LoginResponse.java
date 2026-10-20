package com.staffsync.auth.dto;

import com.staffsync.user.dto.UserDto;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "JWT access token (valid for 8 h) and the logged-in user")
public record LoginResponse(@Schema(example = "eyJhbGciOiJIUzI1NiJ9...") String token, UserDto user) {

}

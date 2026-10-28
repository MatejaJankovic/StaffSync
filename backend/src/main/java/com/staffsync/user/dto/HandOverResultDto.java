package com.staffsync.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "How many open projects changed hands")
public record HandOverResultDto(@Schema(example = "2") int projects) {

}

package io.apocalypse.system.authorization.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonAnySetter;

public record PermissionSaveReq(
    @NotNull @Min(0) Integer expectedVersion,
    @NotBlank @Size(max = 64) String name,
    @Size(max = 500) String description,
    @NotNull @Min(0) @Max(1) Integer status,
    @NotBlank @Pattern(regexp = "ACTIVE|DEPRECATED") String lifecycle) {
  @JsonAnySetter
  public void rejectUnknown(String name, Object value) {
    throw new IllegalArgumentException("权限定义不接受字段：" + name);
  }
}

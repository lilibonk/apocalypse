package io.apocalypse.system.authorization.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AuthorizationInsightServiceTest {

  @Test
  void classifyDomainKeyMapsCoreResourcesAndOptionalModulesDeterministically() {
    assertThat(AuthorizationInsightService.classifyDomainKey("calendar", "calendar:event:list"))
        .isEqualTo("calendar");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:user:list"))
        .isEqualTo("identity_org");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:dept:edit"))
        .isEqualTo("identity_org");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:role:edit"))
        .isEqualTo("rbac_nav");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:permission:list"))
        .isEqualTo("rbac_nav");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:menu:add"))
        .isEqualTo("rbac_nav");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:dict:list"))
        .isEqualTo("runtime_config");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:config:edit"))
        .isEqualTo("runtime_config");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:online:kick"))
        .isEqualTo("runtime_config");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "system:log:login"))
        .isEqualTo("security_audit");
    assertThat(AuthorizationInsightService.classifyDomainKey(null, "order:list"))
        .isEqualTo("security_audit");
  }

  @Test
  void isWriteActionSeparatesReadOnlyVerbsFromGovernanceMutations() {
    for (String readVerb :
        new String[] {"list", "query", "detail", "view", "export", "overview", "holders"}) {
      assertThat(AuthorizationInsightService.isWriteAction("system:user:" + readVerb)).isFalse();
    }
    for (String writeVerb : new String[] {"add", "edit", "remove", "kick", "grant"}) {
      assertThat(AuthorizationInsightService.isWriteAction("system:user:" + writeVerb)).isTrue();
    }
  }
}

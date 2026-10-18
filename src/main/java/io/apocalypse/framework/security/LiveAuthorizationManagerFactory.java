package io.apocalypse.framework.security;

import java.util.Arrays;

import org.aopalliance.intercept.MethodInvocation;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationManagerFactory;
import org.springframework.security.authorization.DefaultAuthorizationManagerFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/** Spring 7.1 原生方法授权入口；用户业务权限只来自当前方法的实时授权快照。 */
@Component
@RequiredArgsConstructor
public class LiveAuthorizationManagerFactory
    implements AuthorizationManagerFactory<MethodInvocation> {
  private final PermissionActionRegistry registry;

  private final AuthorizationManagerFactory<MethodInvocation> identity =
      new DefaultAuthorizationManagerFactory<>();

  @Override
  public AuthorizationManager<MethodInvocation> hasAuthority(String authority) {
    if (authority.startsWith("ROLE_") || authority.startsWith("SCOPE_")) {
      return identity.hasAuthority(authority);
    }
    return (authentication, invocation) -> {
      if (!registry.isExecutable(authority)) {
        return new AuthorizationDecision(false);
      }
      var principal = authentication.get();
      if (principal == null
          || !principal.isAuthenticated()
          || !(principal.getPrincipal() instanceof Jwt jwt)
          || !"access".equals(jwt.getClaimAsString("type"))) {
        return new AuthorizationDecision(false);
      }
      var snapshot = AuthorizationInvocationContext.snapshot(invocation, principal);
      return new AuthorizationDecision(snapshot.allows(authority));
    };
  }

  @Override
  public AuthorizationManager<MethodInvocation> hasAnyAuthority(String... authorities) {
    var managers = Arrays.stream(authorities).map(this::hasAuthority).toList();
    return (authentication, invocation) ->
        new AuthorizationDecision(
            managers.stream()
                .anyMatch(manager -> manager.authorize(authentication, invocation).isGranted()));
  }

  @Override
  public AuthorizationManager<MethodInvocation> hasAllAuthorities(String... authorities) {
    var managers = Arrays.stream(authorities).map(this::hasAuthority).toList();
    return (authentication, invocation) ->
        new AuthorizationDecision(
            !managers.isEmpty()
                && managers.stream()
                    .allMatch(
                        manager -> manager.authorize(authentication, invocation).isGranted()));
  }
}

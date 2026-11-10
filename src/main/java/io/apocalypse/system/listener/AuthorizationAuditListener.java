package io.apocalypse.system.listener;

import io.apocalypse.common.event.AuthorizationChangedEvent;
import io.apocalypse.system.authorization.entity.AuthorizationAuditEntity;
import io.apocalypse.system.authorization.mapper.AuthorizationAuditMapper;
import io.apocalypse.system.realtime.service.RealtimePulseHub;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

@Component
public class AuthorizationAuditListener {
  private final AuthorizationAuditMapper mapper;

  private final RealtimePulseHub realtimePulseHub;

  public AuthorizationAuditListener(AuthorizationAuditMapper mapper) {
    this(mapper, null);
  }

  @Autowired
  public AuthorizationAuditListener(
      AuthorizationAuditMapper mapper, RealtimePulseHub realtimePulseHub) {
    this.mapper = mapper;
    this.realtimePulseHub = realtimePulseHub;
  }

  @ApplicationModuleListener
  public void onAuthorizationChanged(AuthorizationChangedEvent event) {
    AuthorizationAuditEntity entity = new AuthorizationAuditEntity();
    entity.setEventId(event.eventId().toString());
    entity.setOccurredAt(event.occurredAt());
    entity.setActorId(event.actorId());
    entity.setSubjectType(event.subjectType());
    entity.setSubjectId(event.subjectId());
    entity.setBeforeRevision(event.beforeRevision());
    entity.setAfterRevision(event.afterRevision());
    entity.setBeforeConfiguration(event.beforeConfiguration());
    entity.setAfterConfiguration(event.afterConfiguration());
    entity.setDiffHash(event.diffHash());
    entity.setRequestId(event.requestId());
    mapper.insertIdempotent(entity);
    if (realtimePulseHub != null) {
      realtimePulseHub.broadcast("authorizationChanged");
    }
  }
}

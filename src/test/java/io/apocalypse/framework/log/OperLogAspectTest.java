package io.apocalypse.framework.log;

import io.apocalypse.common.event.OperLoggedEvent;
import io.apocalypse.common.exception.BizException;

import java.util.Map;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import tools.jackson.databind.ObjectMapper;

class OperLogAspectTest {
  @OperLog(
      fields = {
        "/request/expectedVersion",
        "/request/password",
        "/request/content",
        "/request/missing",
        "/id",
        "/version"
      })
  public void restricted() {}

  @OperLog
  public void legacy() {}

  @Test
  void explicitPointersSelectOnlyScalarMetadataAndStillApplySecretMasking() throws Throwable {
    var publisher = mock(OperLogEventPublisher.class);
    var point = point();
    when(point.proceed()).thenReturn(Map.of("id", 42, "version", 3, "content", "private title"));
    new OperLogAspect(publisher, new ObjectMapper()).around(point, annotation("restricted"));
    var event = ArgumentCaptor.forClass(OperLoggedEvent.class);
    verify(publisher).publish(event.capture());
    assertThat(event.getValue().operParam())
        .contains("expectedVersion", "7", "***")
        .doesNotContain("credential", "private title", "content", "missing");
    assertThat(event.getValue().operResult()).contains("42", "3").doesNotContain("private title");
    assertThat(event.getValue().status()).isEqualTo(1);
  }

  @Test
  void restrictedFailuresDoNotLogBusinessTextButPreserveTheBusinessCode() throws Throwable {
    var publisher = mock(OperLogEventPublisher.class);
    var point = point();
    var original = new BizException(40900, "conflict: private title credential");
    when(point.proceed()).thenThrow(original);
    assertThatThrownBy(
            () ->
                new OperLogAspect(publisher, new ObjectMapper())
                    .around(point, annotation("restricted")))
        .isSameAs(original);
    var event = ArgumentCaptor.forClass(OperLoggedEvent.class);
    verify(publisher).publish(event.capture());
    assertThat(event.getValue().status()).isZero();
    assertThat(event.getValue().errorMsg()).isEqualTo("BizException:40900");
    assertThat(event.getValue().operResult()).isNull();
  }

  @Test
  void unconfiguredExistingControllersKeepLegacyMasking() throws Throwable {
    var publisher = mock(OperLogEventPublisher.class);
    var point = point();
    when(point.proceed()).thenReturn(null);
    new OperLogAspect(publisher, new ObjectMapper()).around(point, annotation("legacy"));
    var event = ArgumentCaptor.forClass(OperLoggedEvent.class);
    verify(publisher).publish(event.capture());
    assertThat(event.getValue().operParam())
        .contains("private title", "***")
        .doesNotContain("credential");
  }

  private static OperLog annotation(String name) throws NoSuchMethodException {
    return OperLogAspectTest.class.getMethod(name).getAnnotation(OperLog.class);
  }

  private static ProceedingJoinPoint point() {
    var point = mock(ProceedingJoinPoint.class);
    var signature = mock(MethodSignature.class);
    when(point.getSignature()).thenReturn(signature);
    when(signature.getName()).thenReturn("testCommand");
    when(signature.getDeclaringTypeName()).thenReturn("CalendarAuditTest");
    when(signature.getParameterNames()).thenReturn(new String[] {"request"});
    when(point.getArgs())
        .thenReturn(
            new Object[] {
              Map.of(
                  "expectedVersion",
                  7,
                  "password",
                  "credential",
                  "content",
                  Map.of("title", "private title"))
            });
    return point;
  }
}

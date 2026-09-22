package io.apocalypse.framework.web;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.server.observation.ServerRequestObservationContext;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.observation.Observation;

class HttpBusinessMetricsTest {

  private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

  @AfterEach
  void closeRegistry() {
    registry.close();
  }

  @ParameterizedTest
  @CsvSource({
    "0,success",
    "40000,validation",
    "40100,authentication",
    "40300,authorization",
    "40400,not_found",
    "40900,conflict",
    "42900,rate_limited",
    "42901,rate_limited",
    "50000,system_error",
    "11019,other",
    "999999,other"
  })
  void mapsOnlyKnownCodesAndNeverExposesTheRawCode(int code, String expected) {
    HttpBusinessMetrics metrics = new HttpBusinessMetrics(registry);
    var context = context("/users/987654", 200);
    metrics.onStart(context);
    HttpBusinessMetrics.recordCode(context.getCarrier(), code);
    metrics.onStop(context);
    assertThat(registry.getMeters()).hasSize(1);
    var counter = registry.get(HttpBusinessMetrics.METER_NAME).counter();
    assertThat(counter.count()).isEqualTo(1);
    assertThat(counter.getId().getTag("result")).isEqualTo(expected);
    assertThat(counter.getId().getTag("route")).isEqualTo("UNKNOWN");
    assertThat(counter.getId().getTags()).hasSize(2);
  }

  @ParameterizedTest
  @CsvSource({
    "400,validation",
    "401,authentication",
    "403,authorization",
    "404,not_found",
    "409,conflict",
    "422,validation",
    "429,rate_limited",
    "418,other",
    "500,system_error",
    "503,system_error"
  })
  void finalHttpFailureOverridesEarlierSuccess(int status, String expected) {
    HttpBusinessMetrics metrics = new HttpBusinessMetrics(registry);
    var context = context("/download", status);
    metrics.onStart(context);
    HttpBusinessMetrics.recordCode(context.getCarrier(), 0);
    metrics.onStop(context);
    assertThat(
            registry.get(HttpBusinessMetrics.METER_NAME).tag("result", expected).counter().count())
        .isEqualTo(1);
  }

  @Test
  void failedWriteOverridesSuccessAndNonEnvelopeSuccessRemainsUnclassified() {
    HttpBusinessMetrics metrics = new HttpBusinessMetrics(registry);
    var failed = context("/file", 200);
    HttpBusinessMetrics.recordCode(failed.getCarrier(), 0);
    failed.setError(new IOException("connection closed"));
    metrics.onStop(failed);
    metrics.onStop(context("/file", 200));
    assertThat(
            registry
                .get(HttpBusinessMetrics.METER_NAME)
                .tag("result", "system_error")
                .counter()
                .count())
        .isEqualTo(1);
    assertThat(
            registry
                .get(HttpBusinessMetrics.METER_NAME)
                .tag("result", "unclassified")
                .counter()
                .count())
        .isEqualTo(1);
  }

  @Test
  void onlyMatchedHandlerTemplatesBecomeRouteLabels() throws Exception {
    HttpBusinessMetrics metrics = new HttpBusinessMetrics(registry);
    for (int id = 0; id < 100; id++) {
      var unmatched = context("/missing/" + id + "?token=private-" + id, 404);
      unmatched.setPathPattern(unmatched.getCarrier().getRequestURI());
      metrics.onStop(unmatched);
      var matched = context("/users/" + id, 200);
      matched
          .getCarrier()
          .setAttribute(
              HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE,
              new HandlerMethod(this, getClass().getDeclaredMethod("handler")));
      matched.setPathPattern("/users/{id}");
      HttpBusinessMetrics.recordCode(matched.getCarrier(), 0);
      metrics.onStop(matched);
    }
    assertThat(registry.getMeters()).hasSize(2);
    assertThat(registry.getMeters())
        .extracting(meter -> meter.getId().getTag("route"))
        .containsExactlyInAnyOrder("UNKNOWN", "/users/{id}");
  }

  @Test
  void concurrentCompletionCountsEveryRequestOnceAndKeepsResultsIsolated() throws Exception {
    try (var executor = Executors.newFixedThreadPool(8)) {
      HttpBusinessMetrics metrics = new HttpBusinessMetrics(registry);
      List<Callable<Void>> completions = new ArrayList<>();
      for (int index = 0; index < 100; index++) {
        var context = context("/request/" + index, 200);
        metrics.onStart(context);
        HttpBusinessMetrics.recordCode(context.getCarrier(), index % 2 == 0 ? 0 : 40000);
        for (int duplicate = 0; duplicate < 3; duplicate++) {
          completions.add(
              () -> {
                metrics.onStop(context);
                return null;
              });
        }
      }
      for (var future : executor.invokeAll(completions)) {
        future.get();
      }
      assertThat(
              registry
                  .get(HttpBusinessMetrics.METER_NAME)
                  .tag("result", "success")
                  .counter()
                  .count())
          .isEqualTo(50);
      assertThat(
              registry
                  .get(HttpBusinessMetrics.METER_NAME)
                  .tag("result", "validation")
                  .counter()
                  .count())
          .isEqualTo(50);
    }
  }

  @Test
  void ignoresOtherObservationsAndDoesNotPropagateRegistryFailure() {
    MeterRegistry registry = mock(MeterRegistry.class);
    when(registry.counter(eq(HttpBusinessMetrics.METER_NAME), any(String[].class)))
        .thenThrow(new IllegalStateException("registry unavailable"));
    HttpBusinessMetrics metrics = new HttpBusinessMetrics(registry);
    assertThat(metrics.supportsContext(new Observation.Context())).isFalse();
    var context = context("/safe", 200);
    assertThat(metrics.supportsContext(context)).isTrue();
    assertThatCode(() -> metrics.onStop(context)).doesNotThrowAnyException();
    assertThat(context.getResponse().getStatus()).isEqualTo(200);
  }

  private static ServerRequestObservationContext context(String uri, int status) {
    var request = new MockHttpServletRequest("GET", uri);
    var response = new MockHttpServletResponse();
    response.setStatus(status);
    return new ServerRequestObservationContext(request, response);
  }

  private void handler() {}
}

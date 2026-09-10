package io.apocalypse.fixture.application;

import io.apocalypse.fixture.infrastructure.persistence.FixtureMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
public class FixtureRuntime {
  public static final AtomicInteger RESOURCE_READS = new AtomicInteger();
  private final FixtureMapper mapper;

  public FixtureRuntime(FixtureMapper mapper) throws IOException {
    this.mapper = mapper;
    String content =
        new ClassPathResource("fixture/owned.txt").getContentAsString(StandardCharsets.UTF_8);
    if (!content.strip().equals("fixture-owned-resource")) throw new IOException("坏夹具资源");
    RESOURCE_READS.incrementAndGet();
  }

  public int status() {
    return mapper.status();
  }
}

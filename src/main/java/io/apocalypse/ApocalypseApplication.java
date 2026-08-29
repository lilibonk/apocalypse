package io.apocalypse;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ApocalypseApplication {

  private ApocalypseApplication() {}

  public static void main(String[] args) {
    SpringApplication.run(ApocalypseApplication.class, args);
  }
}

package com.staffsync;

import org.springframework.boot.SpringApplication;

public class TestStaffsyncBackendApplication {

	public static void main(String[] args) {
		SpringApplication.from(StaffsyncBackendApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}

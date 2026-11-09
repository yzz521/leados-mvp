package com.leados;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.concurrent.Executors;

public final class LeadOsApplication {
    private LeadOsApplication() {}

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        Path dataDir = Path.of(System.getenv().getOrDefault("LEADOS_DATA_DIR", "./data")).toAbsolutePath();
        LeadStore store = new LeadStore(dataDir);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/", new ApiHandler(store));
        server.setExecutor(Executors.newFixedThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors())));
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(1)));
        server.start();
        System.out.println("LeadOS MVP started: http://localhost:" + port);
        System.out.println("Data file: " + dataDir.resolve("leados.json"));
        System.out.println("Demo mode: single local workspace; no authentication is enabled.");
    }
}

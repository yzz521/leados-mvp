package com.leados;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Local AI workspace store.
 *
 * This is intentionally separate from the lead store so older leados.json files remain
 * backward compatible. Production SaaS should replace it with tenant-scoped database
 * repositories and enforce authenticated ownership on every read and write.
 */
final class AiStore {
    private final Path file;
    private final List<Map<String, Object>> knowledge = new ArrayList<>();
    private final List<Map<String, Object>> conversations = new ArrayList<>();

    AiStore(Path dataDir) throws IOException {
        Files.createDirectories(dataDir);
        this.file = dataDir.resolve("leados-ai.json");
        if (Files.exists(file)) load();
        else persist();
    }

    synchronized List<Map<String, Object>> knowledge() {
        return copies(knowledge);
    }

    synchronized List<Map<String, Object>> knowledgeFor(String marketType) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> item : knowledge) {
            String market = str(item.get("marketType"));
            if ("ALL".equals(market) || market.equals(marketType)) result.add(copy(item));
        }
        return result;
    }

    synchronized Map<String, Object> addKnowledge(Map<String, Object> input) throws IOException {
        Map<String, Object> item = copy(input);
        item.putIfAbsent("id", newId("knw"));
        item.putIfAbsent("createdAt", Instant.now().toString());
        item.put("updatedAt", Instant.now().toString());
        knowledge.add(item);
        persist();
        return copy(item);
    }

    synchronized Map<String, Object> deleteKnowledge(String id) throws IOException {
        Map<String, Object> removed = null;
        for (int i = 0; i < knowledge.size(); i++) {
            if (id.equals(knowledge.get(i).get("id"))) {
                removed = knowledge.remove(i);
                break;
            }
        }
        if (removed != null) persist();
        return copy(removed);
    }

    synchronized Map<String, Object> conversation(String id) {
        return copyDeep(find(conversations, id));
    }

    synchronized Map<String, Object> conversationForLead(String id, String leadId) {
        Map<String, Object> item = find(conversations, id);
        if (item == null || !leadId.equals(str(item.get("leadId")))) return null;
        return copyDeep(item);
    }

    synchronized Map<String, Object> createConversation(String leadId) throws IOException {
        String now = Instant.now().toString();
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", newId("conv"));
        item.put("leadId", leadId);
        item.put("messages", new ArrayList<Map<String, Object>>());
        item.put("actions", new ArrayList<Map<String, Object>>());
        item.put("createdAt", now);
        item.put("updatedAt", now);
        conversations.add(item);
        persist();
        return copyDeep(item);
    }

    synchronized Map<String, Object> appendMessage(String conversationId, String role, String content) throws IOException {
        Map<String, Object> item = find(conversations, conversationId);
        if (item == null) return null;
        List<Map<String, Object>> messages = mapList(item.get("messages"));
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("id", newId("msg"));
        message.put("role", role);
        message.put("content", content == null ? "" : content);
        message.put("createdAt", Instant.now().toString());
        messages.add(message);
        while (messages.size() > 60) messages.remove(0);
        item.put("messages", messages);
        item.put("updatedAt", Instant.now().toString());
        persist();
        return copyDeep(message);
    }

    synchronized void replacePendingActions(String conversationId, List<Map<String, Object>> pendingActions) throws IOException {
        Map<String, Object> item = find(conversations, conversationId);
        if (item == null) return;
        List<Map<String, Object>> all = mapList(item.get("actions"));
        all.removeIf(action -> "PENDING".equals(action.get("status")));
        for (Map<String, Object> action : pendingActions) all.add(copyDeep(action));
        while (all.size() > 40) all.remove(0);
        item.put("actions", all);
        item.put("updatedAt", Instant.now().toString());
        persist();
    }

    synchronized Map<String, Object> action(String conversationId, String actionId) {
        Map<String, Object> item = find(conversations, conversationId);
        if (item == null) return null;
        for (Map<String, Object> action : mapList(item.get("actions"))) {
            if (actionId.equals(action.get("id"))) return copyDeep(action);
        }
        return null;
    }

    synchronized Map<String, Object> completeAction(String conversationId, String actionId,
                                                     String status, Map<String, Object> result) throws IOException {
        Map<String, Object> item = find(conversations, conversationId);
        if (item == null) return null;
        List<Map<String, Object>> actions = mapList(item.get("actions"));
        for (Map<String, Object> action : actions) {
            if (actionId.equals(action.get("id"))) {
                action.put("status", status);
                action.put("result", result == null ? Map.of() : copyDeep(result));
                action.put("completedAt", Instant.now().toString());
                item.put("actions", actions);
                item.put("updatedAt", Instant.now().toString());
                persist();
                return copyDeep(action);
            }
        }
        return null;
    }

    synchronized void appendToolResultMessage(String conversationId, String content) throws IOException {
        appendMessage(conversationId, "assistant", content);
    }

    synchronized String newId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    @SuppressWarnings("unchecked")
    private void load() throws IOException {
        String content = Files.readString(file, StandardCharsets.UTF_8);
        Object parsed = Json.parse(content);
        if (!(parsed instanceof Map<?, ?> root)) throw new IOException("AI data file format is invalid");
        Object knowledgeValue = root.get("knowledge");
        Object conversationsValue = root.get("conversations");
        if (knowledgeValue instanceof List<?> list) {
            for (Object item : list) if (item instanceof Map<?, ?> map) knowledge.add((Map<String, Object>) map);
        }
        if (conversationsValue instanceof List<?> list) {
            for (Object item : list) if (item instanceof Map<?, ?> map) conversations.add((Map<String, Object>) map);
        }
    }

    private void persist() throws IOException {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schemaVersion", 1);
        root.put("updatedAt", Instant.now().toString());
        root.put("knowledge", knowledge);
        root.put("conversations", conversations);
        Path temp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(temp, Json.stringify(root), StandardCharsets.UTF_8);
        try {
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ex) {
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private Map<String, Object> find(List<Map<String, Object>> items, String id) {
        for (Map<String, Object> item : items) if (id.equals(item.get("id"))) return item;
        return null;
    }

    private List<Map<String, Object>> copies(List<Map<String, Object>> source) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> item : source) result.add(copyDeep(item));
        return result;
    }

    private List<Map<String, Object>> mapList(Object value) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object item : list) if (item instanceof Map<?, ?> map) {
                Map<String, Object> copy = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) copy.put(String.valueOf(entry.getKey()), entry.getValue());
                result.add(copy);
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> copyDeep(Map<String, Object> source) {
        if (source == null) return null;
        return (Map<String, Object>) Json.parse(Json.stringify(source));
    }

    private Map<String, Object> copy(Map<String, Object> source) {
        return source == null ? null : new LinkedHashMap<>(source);
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}

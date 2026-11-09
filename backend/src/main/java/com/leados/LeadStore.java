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

/** File-backed demo repository. Replace with PostgreSQL repositories for production SaaS. */
final class LeadStore {
    private final Path file;
    private final List<Map<String, Object>> leads = new ArrayList<>();
    private final List<Map<String, Object>> tasks = new ArrayList<>();
    private final List<Map<String, Object>> activities = new ArrayList<>();

    LeadStore(Path dataDir) throws IOException {
        Files.createDirectories(dataDir);
        this.file = dataDir.resolve("leados.json");
        if (Files.exists(file)) load();
        else {
            seed();
            persist();
        }
    }

    synchronized List<Map<String, Object>> leads() { return copies(leads); }
    synchronized List<Map<String, Object>> tasks() { return copies(tasks); }
    synchronized List<Map<String, Object>> activities() { return copies(activities); }

    synchronized Map<String, Object> lead(String id) { return copy(find(leads, id)); }
    synchronized Map<String, Object> task(String id) { return copy(find(tasks, id)); }

    synchronized void addLead(Map<String, Object> lead) throws IOException {
        leads.add(copy(lead));
        persist();
    }

    synchronized Map<String, Object> updateLead(String id, Map<String, Object> updates) throws IOException {
        Map<String, Object> existing = find(leads, id);
        if (existing == null) return null;
        existing.putAll(updates);
        existing.put("updatedAt", Instant.now().toString());
        persist();
        return copy(existing);
    }

    synchronized boolean removeLead(String id) throws IOException {
        boolean removed = leads.removeIf(item -> id.equals(item.get("id")));
        if (removed) {
            tasks.removeIf(item -> id.equals(item.get("leadId")));
            activities.removeIf(item -> id.equals(item.get("leadId")));
            persist();
        }
        return removed;
    }

    synchronized void addTask(Map<String, Object> task) throws IOException {
        tasks.add(copy(task));
        persist();
    }

    synchronized boolean removeTask(String id) throws IOException {
        boolean removed = tasks.removeIf(item -> id.equals(item.get("id")));
        if (removed) persist();
        return removed;
    }

    synchronized Map<String, Object> updateTask(String id, Map<String, Object> updates) throws IOException {
        Map<String, Object> existing = find(tasks, id);
        if (existing == null) return null;
        existing.putAll(updates);
        existing.put("updatedAt", Instant.now().toString());
        persist();
        return copy(existing);
    }

    synchronized void addActivity(Map<String, Object> activity) throws IOException {
        activities.add(copy(activity));
        persist();
    }

    synchronized String newId(String prefix) { return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12); }

    private Map<String, Object> find(List<Map<String, Object>> list, String id) {
        for (Map<String, Object> item : list) if (id.equals(item.get("id"))) return item;
        return null;
    }

    private List<Map<String, Object>> copies(List<Map<String, Object>> source) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> item : source) result.add(copy(item));
        return result;
    }

    private Map<String, Object> copy(Map<String, Object> source) {
        return source == null ? null : new LinkedHashMap<>(source);
    }

    @SuppressWarnings("unchecked")
    private void load() throws IOException {
        String content = Files.readString(file, StandardCharsets.UTF_8);
        Object parsed = Json.parse(content);
        if (!(parsed instanceof Map<?, ?> root)) throw new IOException("Data file format is invalid");
        Object leadsValue = root.get("leads");
        Object tasksValue = root.get("tasks");
        Object activitiesValue = root.get("activities");
        if (leadsValue instanceof List<?> list) for (Object item : list) if (item instanceof Map<?, ?> map) leads.add((Map<String, Object>) map);
        if (tasksValue instanceof List<?> list) for (Object item : list) if (item instanceof Map<?, ?> map) tasks.add((Map<String, Object>) map);
        if (activitiesValue instanceof List<?> list) for (Object item : list) if (item instanceof Map<?, ?> map) activities.add((Map<String, Object>) map);
    }

    private void persist() throws IOException {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schemaVersion", 1);
        root.put("updatedAt", Instant.now().toString());
        root.put("leads", leads);
        root.put("tasks", tasks);
        root.put("activities", activities);
        Path temp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(temp, Json.stringify(root), StandardCharsets.UTF_8);
        try { Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
        catch (AtomicMoveNotSupportedException ex) { Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING); }
    }

    private void seed() {
        String now = Instant.now().toString();
        addSeedLead("LOCAL", "COMPANY", "郑州简居全屋定制", "李女士", "", "", "郑州", "官网表单", "全屋定制", "新房装修，计划下月量房，关注环保板材和交付周期", "20-30 万", "1-3个月", "QUALIFIED", 72, "需求明确且已提供地区、预算和时间线", "UNCONFIRMED", now);
        addSeedLead("LOCAL", "COMPANY", "中原智家门窗", "王经理", "", "", "郑州", "二维码", "系统门窗", "旧房更换门窗，想先了解隔音和保温方案", "1-3 万", "待沟通", "NEW", 48, "已提供产品需求，预算及时间尚待确认", "UNCONFIRMED", now);
        addSeedLead("LOCAL", "PERSON", "", "客户A", "", "", "开封", "人工录入", "汽车保养", "咨询年度保养套餐，希望周末到店", "1000-3000 元", "本周", "CONTACTED", 66, "有明确服务需求和到店时间意向", "UNCONFIRMED", now);
        addSeedLead("EXPORT", "COMPANY", "North Star Machinery Sp. z o.o.", "采购部门（待核验）", "procurement@example.com", "", "波兰", "企业官网研究", "工业切割设备", "官网产品目录包含金属加工设备，尚未确认采购计划", "待确认", "待确认", "QUALIFIED", 64, "产品类别存在匹配，但采购意向未验证", "UNCONFIRMED", now);
        addSeedLead("EXPORT", "COMPANY", "Baltic Industrial Supply GmbH", "", "", "", "德国", "人工录入", "工业设备经销", "待核实经销范围、品牌代理及采购负责人", "待确认", "待确认", "NEW", 34, "企业信息尚不完整，需先补充研究", "UNCONFIRMED", now);

        Map<String, Object> task = new LinkedHashMap<>();
        task.put("id", newId("tsk")); task.put("tenantId", "demo"); task.put("leadId", leads.get(0).get("id"));
        task.put("title", "联系客户确认量房时间"); task.put("description", "根据客户需求，确认可预约的量房时间段。");
        task.put("priority", "HIGH"); task.put("status", "OPEN"); task.put("dueAt", Instant.now().plusSeconds(86400).toString());
        task.put("createdAt", now); task.put("updatedAt", now); tasks.add(task);

        Map<String, Object> activity = new LinkedHashMap<>();
        activity.put("id", newId("act")); activity.put("leadId", leads.get(0).get("id"));
        activity.put("type", "SYSTEM"); activity.put("content", "演示数据：线索已导入并完成基础信息整理。");
        activity.put("createdAt", now); activities.add(activity);
    }

    private void addSeedLead(String market, String subject, String company, String contact, String email, String phone,
                             String region, String source, String product, String requirement, String budget, String timeline,
                             String status, int score, String reason, String permission, String now) {
        Map<String, Object> lead = new LinkedHashMap<>();
        lead.put("id", newId("led")); lead.put("tenantId", "demo"); lead.put("marketType", market); lead.put("subjectType", subject);
        lead.put("companyName", company); lead.put("contactName", contact); lead.put("email", email); lead.put("phone", phone);
        lead.put("region", region); lead.put("source", source); lead.put("productInterest", product); lead.put("requirement", requirement);
        lead.put("budget", budget); lead.put("timeline", timeline); lead.put("owner", "未分配"); lead.put("status", status);
        lead.put("score", score); lead.put("scoreLevel", level(score)); lead.put("scoreReason", reason);
        lead.put("contactPermission", permission); lead.put("createdAt", now); lead.put("updatedAt", now);
        leads.add(lead);
    }

    private String level(int score) { return score >= 75 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW"; }
}

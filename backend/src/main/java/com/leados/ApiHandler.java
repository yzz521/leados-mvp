package com.leados;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class ApiHandler implements HttpHandler {
    private static final int MAX_BODY_BYTES = 2 * 1024 * 1024;
    private static final Set<String> LEAD_FIELDS = Set.of(
            "marketType", "subjectType", "companyName", "contactName", "email", "phone", "region",
            "source", "productInterest", "requirement", "budget", "timeline", "owner", "status", "contactPermission");
    private final LeadStore store;

    ApiHandler(LeadStore store) { this.store = store; }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();
            if (path.startsWith("/api/")) routeApi(exchange, path);
            else serveStatic(exchange, path);
        } catch (IllegalArgumentException ex) {
            sendError(exchange, 400, "BAD_REQUEST", ex.getMessage());
        } catch (Exception ex) {
            ex.printStackTrace(System.err);
            sendError(exchange, 500, "INTERNAL_ERROR", "服务器处理请求时发生错误");
        } finally {
            exchange.close();
        }
    }

    private void routeApi(HttpExchange x, String path) throws IOException {
        String method = x.getRequestMethod().toUpperCase(Locale.ROOT);
        if ("GET".equals(method) && "/api/health".equals(path)) {
            sendJson(x, 200, mapOf("status", "UP", "application", "LeadOS", "version", "0.1.0", "time", Instant.now().toString()));
            return;
        }
        if ("GET".equals(method) && "/api/overview".equals(path)) { sendJson(x, 200, overview()); return; }
        if ("GET".equals(method) && "/api/leads".equals(path)) { listLeads(x); return; }
        if ("POST".equals(method) && "/api/leads".equals(path)) { createLead(x); return; }
        if ("POST".equals(method) && "/api/leads/import/csv".equals(path)) { importCsv(x); return; }
        if ("GET".equals(method) && "/api/tasks".equals(path)) { listTasks(x); return; }
        if ("POST".equals(method) && "/api/tasks".equals(path)) { createTask(x); return; }
        if ("GET".equals(method) && "/api/activities".equals(path)) { listActivities(x); return; }

        String[] parts = path.split("/");
        if (parts.length >= 4 && "leads".equals(parts[2])) {
            String id = decode(parts[3]);
            if (parts.length == 4 && "GET".equals(method)) { getLead(x, id); return; }
            if (parts.length == 4 && ("PATCH".equals(method) || "PUT".equals(method))) { updateLead(x, id); return; }
            if (parts.length == 4 && "DELETE".equals(method)) { deleteLead(x, id); return; }
            if (parts.length == 5 && "analyze".equals(parts[4]) && "POST".equals(method)) { analyzeLead(x, id); return; }
            if (parts.length == 5 && "activities".equals(parts[4]) && "POST".equals(method)) { createActivity(x, id); return; }
        }
        if (parts.length == 4 && "tasks".equals(parts[2])) {
            String id = decode(parts[3]);
            if ("PATCH".equals(method) || "PUT".equals(method)) { updateTask(x, id); return; }
            if ("DELETE".equals(method)) { deleteTask(x, id); return; }
        }
        sendError(x, 404, "NOT_FOUND", "接口不存在");
    }

    private Map<String, Object> overview() {
        List<Map<String, Object>> leads = store.leads();
        List<Map<String, Object>> tasks = store.tasks();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalLeads", leads.size());
        stats.put("newLeads", countLeads(leads, "NEW"));
        stats.put("qualifiedLeads", countLeads(leads, "QUALIFIED"));
        stats.put("opportunities", countLeads(leads, "OPPORTUNITY"));
        stats.put("wonLeads", countLeads(leads, "WON"));
        stats.put("highIntent", leads.stream().filter(l -> number(l.get("score")) >= 75 && !"WON".equals(l.get("status")) && !"LOST".equals(l.get("status"))).count());
        stats.put("openTasks", tasks.stream().filter(t -> !"DONE".equals(t.get("status"))).count());
        stats.put("localLeads", leads.stream().filter(l -> "LOCAL".equals(l.get("marketType"))).count());
        stats.put("exportLeads", leads.stream().filter(l -> "EXPORT".equals(l.get("marketType"))).count());
        Map<String, Object> byStatus = new LinkedHashMap<>();
        for (String status : List.of("NEW", "QUALIFIED", "CONTACTED", "OPPORTUNITY", "WON", "LOST")) byStatus.put(status, countLeads(leads, status));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stats", stats); result.put("funnel", byStatus);
        result.put("recentLeads", leads.stream().sorted(Comparator.comparing(l -> String.valueOf(l.get("createdAt")), Comparator.reverseOrder())).limit(6).toList());
        result.put("upcomingTasks", tasks.stream().filter(t -> !"DONE".equals(t.get("status"))).sorted(Comparator.comparing(t -> String.valueOf(t.getOrDefault("dueAt", "9999")))).limit(6).toList());
        return result;
    }

    private long countLeads(List<Map<String, Object>> leads, String status) {
        return leads.stream().filter(l -> status.equals(l.get("status"))).count();
    }

    private void listLeads(HttpExchange x) throws IOException {
        Map<String, String> q = query(x);
        String market = q.getOrDefault("marketType", "ALL").toUpperCase(Locale.ROOT);
        String status = q.getOrDefault("status", "ALL").toUpperCase(Locale.ROOT);
        String keyword = q.getOrDefault("q", "").toLowerCase(Locale.ROOT).trim();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> lead : store.leads()) {
            if (!"ALL".equals(market) && !market.equals(lead.get("marketType"))) continue;
            if (!"ALL".equals(status) && !status.equals(lead.get("status"))) continue;
            if (!keyword.isEmpty()) {
                String haystack = String.join(" ", str(lead.get("companyName")), str(lead.get("contactName")), str(lead.get("email")),
                        str(lead.get("phone")), str(lead.get("productInterest")), str(lead.get("requirement")), str(lead.get("region"))).toLowerCase(Locale.ROOT);
                if (!haystack.contains(keyword)) continue;
            }
            result.add(lead);
        }
        result.sort(Comparator.comparing(l -> str(l.get("createdAt")), Comparator.reverseOrder()));
        sendJson(x, 200, mapOf("items", result, "total", result.size()));
    }

    private void createLead(HttpExchange x) throws IOException {
        Map<String, Object> input = body(x);
        Map<String, Object> lead = new LinkedHashMap<>();
        lead.put("id", store.newId("led")); lead.put("tenantId", "demo");
        for (String field : LEAD_FIELDS) if (input.containsKey(field)) lead.put(field, clean(input.get(field)));
        String market = enumValue(lead.getOrDefault("marketType", "LOCAL"), Set.of("LOCAL", "EXPORT"), "marketType");
        String subject = enumValue(lead.getOrDefault("subjectType", "COMPANY"), Set.of("COMPANY", "PERSON"), "subjectType");
        String status = enumValue(lead.getOrDefault("status", "NEW"), Set.of("NEW", "QUALIFIED", "CONTACTED", "OPPORTUNITY", "WON", "LOST"), "status");
        String permission = enumValue(lead.getOrDefault("contactPermission", "UNCONFIRMED"), Set.of("UNCONFIRMED", "AUTHORIZED", "OPTED_OUT", "NOT_APPLICABLE"), "contactPermission");
        lead.put("marketType", market); lead.put("subjectType", subject); lead.put("status", status); lead.put("contactPermission", permission);
        lead.putIfAbsent("companyName", ""); lead.putIfAbsent("contactName", ""); lead.putIfAbsent("email", ""); lead.putIfAbsent("phone", "");
        lead.putIfAbsent("region", ""); lead.putIfAbsent("source", "手工录入"); lead.putIfAbsent("productInterest", "");
        lead.putIfAbsent("requirement", ""); lead.putIfAbsent("budget", ""); lead.putIfAbsent("timeline", ""); lead.putIfAbsent("owner", "未分配");
        if (str(lead.get("companyName")).isBlank() && str(lead.get("contactName")).isBlank()) {
            sendError(x, 400, "VALIDATION_ERROR", "企业名称和联系人姓名至少填写一项"); return;
        }
        Map<String, Object> duplicate = findDuplicate(lead, null);
        if (duplicate != null) {
            sendJson(x, 409, mapOf("error", mapOf("code", "DUPLICATE_LEAD", "message", "发现相同邮箱或手机号的线索", "existingLeadId", duplicate.get("id")))); return;
        }
        int initialScore = score(lead);
        lead.put("score", initialScore); lead.put("scoreLevel", scoreLevel(initialScore));
        lead.put("scoreReason", "新建线索，等待 AI 分析");
        String now = Instant.now().toString(); lead.put("createdAt", now); lead.put("updatedAt", now);
        store.addLead(lead);
        store.addActivity(activity(lead.get("id").toString(), "SYSTEM", "线索已创建。"));
        sendJson(x, 201, lead);
    }

    private Map<String, Object> findDuplicate(Map<String, Object> candidate, String excludeId) {
        String email = str(candidate.get("email")).trim().toLowerCase(Locale.ROOT);
        String phone = str(candidate.get("phone")).replaceAll("[^0-9+]", "");
        if (email.isBlank() && phone.isBlank()) return null;
        for (Map<String, Object> existing : store.leads()) {
            if (excludeId != null && excludeId.equals(existing.get("id"))) continue;
            if (!str(candidate.get("marketType")).equals(existing.get("marketType"))) continue;
            boolean emailMatch = !email.isBlank() && email.equals(str(existing.get("email")).trim().toLowerCase(Locale.ROOT));
            String existingPhone = str(existing.get("phone")).replaceAll("[^0-9+]", "");
            boolean phoneMatch = !phone.isBlank() && phone.equals(existingPhone);
            if (emailMatch || phoneMatch) return existing;
        }
        return null;
    }

    private void getLead(HttpExchange x, String id) throws IOException {
        Map<String, Object> lead = store.lead(id);
        if (lead == null) { sendError(x, 404, "LEAD_NOT_FOUND", "线索不存在"); return; }
        List<Map<String, Object>> activities = store.activities().stream().filter(a -> id.equals(a.get("leadId")))
                .sorted(Comparator.comparing(a -> str(a.get("createdAt")), Comparator.reverseOrder())).toList();
        sendJson(x, 200, mapOf("lead", lead, "activities", activities));
    }

    private void updateLead(HttpExchange x, String id) throws IOException {
        Map<String, Object> input = body(x);
        Map<String, Object> updates = new LinkedHashMap<>();
        for (String field : LEAD_FIELDS) if (input.containsKey(field)) updates.put(field, clean(input.get(field)));
        if (updates.containsKey("marketType")) updates.put("marketType", enumValue(updates.get("marketType"), Set.of("LOCAL", "EXPORT"), "marketType"));
        if (updates.containsKey("subjectType")) updates.put("subjectType", enumValue(updates.get("subjectType"), Set.of("COMPANY", "PERSON"), "subjectType"));
        if (updates.containsKey("status")) updates.put("status", enumValue(updates.get("status"), Set.of("NEW", "QUALIFIED", "CONTACTED", "OPPORTUNITY", "WON", "LOST"), "status"));
        if (updates.containsKey("contactPermission")) updates.put("contactPermission", enumValue(updates.get("contactPermission"), Set.of("UNCONFIRMED", "AUTHORIZED", "OPTED_OUT", "NOT_APPLICABLE"), "contactPermission"));
        Map<String, Object> existing = store.lead(id);
        if (existing == null) { sendError(x, 404, "LEAD_NOT_FOUND", "线索不存在"); return; }
        Map<String, Object> candidate = new LinkedHashMap<>(existing); candidate.putAll(updates);
        Map<String, Object> duplicate = findDuplicate(candidate, id);
        if (duplicate != null) { sendError(x, 409, "DUPLICATE_LEAD", "修改后的联系方式与另一条线索重复"); return; }
        Map<String, Object> updated = store.updateLead(id, updates);
        if (updates.containsKey("status")) store.addActivity(activity(id, "STATUS", "线索状态更新为 " + updates.get("status") + "。"));
        sendJson(x, 200, updated);
    }

    private void deleteLead(HttpExchange x, String id) throws IOException {
        boolean removed = store.removeLead(id);
        if (!removed) { sendError(x, 404, "LEAD_NOT_FOUND", "线索不存在"); return; }
        sendJson(x, 200, mapOf("success", true, "id", id));
    }

    private void analyzeLead(HttpExchange x, String id) throws IOException {
        Map<String, Object> lead = store.lead(id);
        if (lead == null) { sendError(x, 404, "LEAD_NOT_FOUND", "线索不存在"); return; }
        int score = score(lead);
        String level = scoreLevel(score);
        List<String> reasons = new ArrayList<>();
        addReason(reasons, lead.get("requirement"), 25, "已描述具体需求");
        addReason(reasons, lead.get("productInterest"), 15, "已明确关注产品");
        addReason(reasons, lead.get("budget"), 15, "已提供预算信息");
        addReason(reasons, lead.get("timeline"), 15, "已提供采购/决策时间");
        addReason(reasons, lead.get("email"), 10, "已提供邮箱");
        addReason(reasons, lead.get("phone"), 10, "已提供电话");
        addReason(reasons, lead.get("region"), 5, "已提供地区/国家");
        addReason(reasons, lead.get("source"), 5, "已记录线索来源");
        if (reasons.isEmpty()) reasons.add("可用信息较少，建议先补全客户需求和联系方式");
        String reason = String.join("；", reasons);
        Map<String, Object> updated = store.updateLead(id, mapOf("score", score, "scoreLevel", level, "scoreReason", reason));
        store.addActivity(activity(id, "AI_ANALYSIS", "规则版客户分析完成：" + score + " 分（" + level + "）。"));
        sendJson(x, 200, mapOf("lead", updated, "analysis", mapOf("score", score, "level", level, "reasons", reasons,
                "recommendation", recommendation(lead, score), "engine", "RULE_BASED_DEMO")));
    }

    private int score(Map<String, Object> lead) {
        int score = 0;
        if (!str(lead.get("requirement")).isBlank()) score += 25;
        if (!str(lead.get("productInterest")).isBlank()) score += 15;
        if (!str(lead.get("budget")).isBlank() && !"待确认".equals(str(lead.get("budget")))) score += 15;
        if (!str(lead.get("timeline")).isBlank() && !"待确认".equals(str(lead.get("timeline")))) score += 15;
        if (!str(lead.get("email")).isBlank()) score += 10;
        if (!str(lead.get("phone")).isBlank()) score += 10;
        if (!str(lead.get("region")).isBlank()) score += 5;
        if (!str(lead.get("source")).isBlank()) score += 5;
        return Math.min(100, score);
    }

    private void addReason(List<String> reasons, Object value, int points, String text) {
        if (!str(value).isBlank() && !"待确认".equals(str(value))) reasons.add(text + "（+" + points + "）");
    }

    private String scoreLevel(int score) { return score >= 75 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW"; }

    private String recommendation(Map<String, Object> lead, int score) {
        if ("OPTED_OUT".equals(lead.get("contactPermission"))) return "客户已拒绝联系：禁止发起营销触达，只保留必要的合规记录。";
        if (score >= 75) return "高优先级：建议负责人尽快人工核实需求、预算和决策时间，再通过获准渠道联系。";
        if (score >= 45) return "中优先级：建议补充预算、采购时间或关键需求，再安排针对性跟进。";
        return "低优先级：先补全企业/联系人资料和需求信息，不建议直接进行高频营销触达。";
    }

    private void importCsv(HttpExchange x) throws IOException {
        Map<String, Object> input = body(x);
        String csv = str(input.get("csv"));
        if (csv.isBlank()) { sendError(x, 400, "VALIDATION_ERROR", "csv 内容不能为空"); return; }
        String defaultMarket = enumValue(input.getOrDefault("marketType", "LOCAL"), Set.of("LOCAL", "EXPORT"), "marketType");
        List<List<String>> rows = parseCsv(csv);
        if (rows.size() < 2) { sendError(x, 400, "CSV_EMPTY", "CSV 至少需要一行表头和一行数据"); return; }
        Map<String, Integer> headers = new HashMap<>();
        List<String> headerRow = rows.get(0);
        for (int i = 0; i < headerRow.size(); i++) headers.put(normalizeHeader(headerRow.get(i)), i);
        int imported = 0, duplicates = 0, invalid = 0;
        List<String> errors = new ArrayList<>();
        for (int rowIndex = 1; rowIndex < rows.size(); rowIndex++) {
            List<String> row = rows.get(rowIndex);
            if (row.stream().allMatch(String::isBlank)) continue;
            Map<String, Object> lead = new LinkedHashMap<>();
            lead.put("id", store.newId("led")); lead.put("tenantId", "demo");
            lead.put("marketType", valueAt(row, headers, "markettype", defaultMarket).toUpperCase(Locale.ROOT));
            lead.put("subjectType", valueAt(row, headers, "subjecttype", "COMPANY").toUpperCase(Locale.ROOT));
            lead.put("companyName", valueAt(row, headers, "companyname", ""));
            lead.put("contactName", valueAt(row, headers, "contactname", ""));
            lead.put("email", valueAt(row, headers, "email", "")); lead.put("phone", valueAt(row, headers, "phone", ""));
            lead.put("region", valueAt(row, headers, "region", "")); lead.put("source", valueAt(row, headers, "source", "CSV 导入"));
            lead.put("productInterest", valueAt(row, headers, "productinterest", ""));
            lead.put("requirement", valueAt(row, headers, "requirement", "")); lead.put("budget", valueAt(row, headers, "budget", ""));
            lead.put("timeline", valueAt(row, headers, "timeline", "")); lead.put("owner", valueAt(row, headers, "owner", "未分配"));
            lead.put("status", "NEW"); lead.put("contactPermission", valueAt(row, headers, "contactpermission", "UNCONFIRMED").toUpperCase(Locale.ROOT));
            try {
                lead.put("marketType", enumValue(lead.get("marketType"), Set.of("LOCAL", "EXPORT"), "marketType"));
                lead.put("subjectType", enumValue(lead.get("subjectType"), Set.of("COMPANY", "PERSON"), "subjectType"));
                lead.put("contactPermission", enumValue(lead.get("contactPermission"), Set.of("UNCONFIRMED", "AUTHORIZED", "OPTED_OUT", "NOT_APPLICABLE"), "contactPermission"));
                if (str(lead.get("companyName")).isBlank() && str(lead.get("contactName")).isBlank()) throw new IllegalArgumentException("缺少企业名称或联系人姓名");
                if (findDuplicate(lead, null) != null) { duplicates++; continue; }
                int score = score(lead); lead.put("score", score); lead.put("scoreLevel", scoreLevel(score)); lead.put("scoreReason", "CSV 导入，等待分析");
                String now = Instant.now().toString(); lead.put("createdAt", now); lead.put("updatedAt", now);
                store.addLead(lead); imported++;
            } catch (IllegalArgumentException ex) {
                invalid++;
                if (errors.size() < 10) errors.add("第 " + (rowIndex + 1) + " 行：" + ex.getMessage());
            }
        }
        sendJson(x, 200, mapOf("imported", imported, "duplicates", duplicates, "invalid", invalid, "errors", errors,
                "message", "导入完成；重复记录已跳过，未验证的联系权限默认为 UNCONFIRMED"));
    }

    private String normalizeHeader(String header) {
        String h = header == null ? "" : header.replace("\uFEFF", "").trim().toLowerCase(Locale.ROOT).replace(" ", "").replace("_", "");
        return switch (h) {
            case "市场", "市场类型", "业务线" -> "markettype";
            case "主体类型" -> "subjecttype";
            case "企业名称", "公司名称", "客户公司", "公司" -> "companyname";
            case "联系人", "姓名" -> "contactname";
            case "邮箱", "邮件", "电子邮箱" -> "email";
            case "电话", "手机号", "手机" -> "phone";
            case "地区", "城市", "国家", "所在地区" -> "region";
            case "来源", "线索来源" -> "source";
            case "产品", "意向产品", "产品兴趣" -> "productinterest";
            case "需求", "客户需求" -> "requirement";
            case "预算" -> "budget";
            case "时间", "采购时间", "预计时间" -> "timeline";
            case "负责人" -> "owner";
            case "联系授权", "授权状态" -> "contactpermission";
            default -> h;
        };
    }

    private String valueAt(List<String> row, Map<String, Integer> headers, String key, String fallback) {
        Integer index = headers.get(key);
        return index == null || index >= row.size() ? fallback : row.get(index).trim();
    }

    private List<List<String>> parseCsv(String csv) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < csv.length(); i++) {
            char c = csv.charAt(i);
            if (quoted) {
                if (c == '"') {
                    if (i + 1 < csv.length() && csv.charAt(i + 1) == '"') { cell.append('"'); i++; }
                    else quoted = false;
                } else cell.append(c);
            } else if (c == '"') quoted = true;
            else if (c == ',') { row.add(cell.toString()); cell.setLength(0); }
            else if (c == '\n') { row.add(cell.toString().replace("\r", "")); rows.add(row); row = new ArrayList<>(); cell.setLength(0); }
            else cell.append(c);
        }
        if (quoted) throw new IllegalArgumentException("CSV 包含未闭合的引号");
        row.add(cell.toString().replace("\r", ""));
        if (!(row.size() == 1 && row.get(0).isBlank())) rows.add(row);
        return rows;
    }

    private void listTasks(HttpExchange x) throws IOException {
        Map<String, String> q = query(x);
        String status = q.getOrDefault("status", "ALL").toUpperCase(Locale.ROOT);
        String leadId = q.get("leadId");
        List<Map<String, Object>> items = store.tasks().stream()
                .filter(t -> "ALL".equals(status) || status.equals(t.get("status")))
                .filter(t -> leadId == null || leadId.equals(t.get("leadId")))
                .sorted(Comparator.comparing(t -> str(t.getOrDefault("dueAt", "9999")))).toList();
        sendJson(x, 200, mapOf("items", items, "total", items.size()));
    }

    private void createTask(HttpExchange x) throws IOException {
        Map<String, Object> input = body(x);
        String title = str(input.get("title")).trim();
        if (title.isBlank()) { sendError(x, 400, "VALIDATION_ERROR", "任务标题不能为空"); return; }
        String leadId = str(input.get("leadId")).trim();
        if (!leadId.isBlank() && store.lead(leadId) == null) { sendError(x, 404, "LEAD_NOT_FOUND", "关联线索不存在"); return; }
        String priority = enumValue(input.getOrDefault("priority", "MEDIUM"), Set.of("LOW", "MEDIUM", "HIGH"), "priority");
        String status = enumValue(input.getOrDefault("status", "OPEN"), Set.of("OPEN", "IN_PROGRESS", "DONE"), "status");
        String now = Instant.now().toString();
        Map<String, Object> task = mapOf("id", store.newId("tsk"), "tenantId", "demo", "leadId", leadId,
                "title", title, "description", str(input.get("description")), "priority", priority, "status", status,
                "dueAt", str(input.getOrDefault("dueAt", now)), "createdAt", now, "updatedAt", now);
        store.addTask(task);
        sendJson(x, 201, task);
    }

    private void deleteTask(HttpExchange x, String id) throws IOException {
        boolean removed = store.removeTask(id);
        if (!removed) { sendError(x, 404, "TASK_NOT_FOUND", "任务不存在"); return; }
        sendJson(x, 200, mapOf("success", true, "id", id));
    }

    private void updateTask(HttpExchange x, String id) throws IOException {
        Map<String, Object> input = body(x);
        Map<String, Object> updates = new LinkedHashMap<>();
        if (input.containsKey("title")) updates.put("title", str(input.get("title")).trim());
        if (input.containsKey("description")) updates.put("description", str(input.get("description")));
        if (input.containsKey("dueAt")) updates.put("dueAt", str(input.get("dueAt")));
        if (input.containsKey("status")) updates.put("status", enumValue(input.get("status"), Set.of("OPEN", "IN_PROGRESS", "DONE"), "status"));
        if (input.containsKey("priority")) updates.put("priority", enumValue(input.get("priority"), Set.of("LOW", "MEDIUM", "HIGH"), "priority"));
        Map<String, Object> result = store.updateTask(id, updates);
        if (result == null) { sendError(x, 404, "TASK_NOT_FOUND", "任务不存在"); return; }
        sendJson(x, 200, result);
    }

    private void createActivity(HttpExchange x, String leadId) throws IOException {
        if (store.lead(leadId) == null) { sendError(x, 404, "LEAD_NOT_FOUND", "线索不存在"); return; }
        Map<String, Object> input = body(x);
        String content = str(input.get("content")).trim();
        if (content.isBlank()) { sendError(x, 400, "VALIDATION_ERROR", "互动内容不能为空"); return; }
        Map<String, Object> activity = activity(leadId, enumValue(input.getOrDefault("type", "NOTE"), Set.of("NOTE", "CALL", "EMAIL", "MEETING", "SYSTEM"), "type"), content);
        store.addActivity(activity);
        sendJson(x, 201, activity);
    }

    private void listActivities(HttpExchange x) throws IOException {
        String leadId = query(x).get("leadId");
        List<Map<String, Object>> items = store.activities().stream().filter(a -> leadId == null || leadId.equals(a.get("leadId")))
                .sorted(Comparator.comparing(a -> str(a.get("createdAt")), Comparator.reverseOrder())).toList();
        sendJson(x, 200, mapOf("items", items, "total", items.size()));
    }

    private Map<String, Object> activity(String leadId, String type, String content) {
        return mapOf("id", store.newId("act"), "leadId", leadId, "type", type, "content", content, "createdAt", Instant.now().toString());
    }

    private void serveStatic(HttpExchange x, String path) throws IOException {
        if (!"GET".equalsIgnoreCase(x.getRequestMethod()) && !"HEAD".equalsIgnoreCase(x.getRequestMethod())) {
            sendError(x, 405, "METHOD_NOT_ALLOWED", "静态资源仅支持 GET"); return;
        }
        String resource = path.equals("/") ? "/static/index.html" : "/static" + path;
        if (resource.contains("..") || resource.contains("\\")) { sendError(x, 400, "BAD_PATH", "非法路径"); return; }
        try (InputStream in = LeadOsApplication.class.getResourceAsStream(resource)) {
            if (in == null) { sendError(x, 404, "NOT_FOUND", "页面或资源不存在"); return; }
            byte[] bytes = in.readAllBytes();
            String type = contentType(resource);
            x.getResponseHeaders().set("Content-Type", type);
            x.getResponseHeaders().set("Cache-Control", "no-cache");
            x.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            if ("HEAD".equalsIgnoreCase(x.getRequestMethod())) { x.sendResponseHeaders(200, -1); return; }
            x.sendResponseHeaders(200, bytes.length);
            x.getResponseBody().write(bytes);
        }
    }

    private String contentType(String path) {
        if (path.endsWith(".html")) return "text/html; charset=utf-8";
        if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (path.endsWith(".css")) return "text/css; charset=utf-8";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private Map<String, String> query(HttpExchange x) {
        Map<String, String> result = new HashMap<>();
        String raw = x.getRequestURI().getRawQuery();
        if (raw == null || raw.isBlank()) return result;
        for (String pair : raw.split("&")) {
            String[] parts = pair.split("=", 2);
            result.put(decode(parts[0]), parts.length > 1 ? decode(parts[1]) : "");
        }
        return result;
    }

    private String decode(String value) { return URLDecoder.decode(value, StandardCharsets.UTF_8); }

    private Map<String, Object> body(HttpExchange x) throws IOException {
        byte[] bytes = x.getRequestBody().readNBytes(MAX_BODY_BYTES + 1);
        if (bytes.length > MAX_BODY_BYTES) throw new IllegalArgumentException("请求体超过 2MB 限制");
        if (bytes.length == 0) return new LinkedHashMap<>();
        return Json.object(new String(bytes, StandardCharsets.UTF_8));
    }

    private void sendJson(HttpExchange x, int status, Object payload) throws IOException {
        byte[] bytes = Json.stringify(payload).getBytes(StandardCharsets.UTF_8);
        x.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        x.getResponseHeaders().set("Cache-Control", "no-store");
        x.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        x.sendResponseHeaders(status, bytes.length);
        x.getResponseBody().write(bytes);
    }

    private void sendError(HttpExchange x, int status, String code, String message) throws IOException {
        sendJson(x, status, mapOf("error", mapOf("code", code, "message", message == null ? "请求失败" : message)));
    }

    private String enumValue(Object value, Set<String> allowed, String field) {
        String result = str(value).trim().toUpperCase(Locale.ROOT);
        if (!allowed.contains(result)) throw new IllegalArgumentException(field + " 的值不合法：" + result);
        return result;
    }

    private Object clean(Object value) { return value == null ? "" : String.valueOf(value).trim(); }
    private String str(Object value) { return value == null ? "" : String.valueOf(value); }
    private int number(Object value) { return value instanceof Number n ? n.intValue() : 0; }

    private Map<String, Object> mapOf(Object... args) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i + 1 < args.length; i += 2) result.put(String.valueOf(args[i]), args[i + 1]);
        return result;
    }
}

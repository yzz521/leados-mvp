package com.leados;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Minimal JSON parser/serializer so the MVP has no third-party runtime dependencies. */
final class Json {
    private Json() {}

    static Object parse(String input) {
        if (input == null) return null;
        Parser parser = new Parser(input);
        Object value = parser.value();
        parser.ws();
        if (!parser.end()) throw new IllegalArgumentException("JSON contains trailing characters");
        return value;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> object(String input) {
        Object parsed = parse(input);
        if (!(parsed instanceof Map<?, ?>)) throw new IllegalArgumentException("JSON body must be an object");
        return (Map<String, Object>) parsed;
    }

    static String stringify(Object value) {
        StringBuilder out = new StringBuilder();
        write(value, out);
        return out.toString();
    }

    private static void write(Object value, StringBuilder out) {
        if (value == null) { out.append("null"); return; }
        if (value instanceof String s) { quote(s, out); return; }
        if (value instanceof Boolean || value instanceof Integer || value instanceof Long || value instanceof Double || value instanceof Float || value instanceof BigDecimal) {
            out.append(value); return;
        }
        if (value instanceof Number n) { out.append(n); return; }
        if (value instanceof Map<?, ?> map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) out.append(',');
                first = false;
                quote(String.valueOf(entry.getKey()), out);
                out.append(':');
                write(entry.getValue(), out);
            }
            out.append('}');
            return;
        }
        if (value instanceof Collection<?> collection) {
            out.append('[');
            boolean first = true;
            for (Object item : collection) {
                if (!first) out.append(',');
                first = false;
                write(item, out);
            }
            out.append(']');
            return;
        }
        if (value.getClass().isArray()) {
            out.append('[');
            int length = java.lang.reflect.Array.getLength(value);
            for (int i = 0; i < length; i++) {
                if (i > 0) out.append(',');
                write(java.lang.reflect.Array.get(value, i), out);
            }
            out.append(']');
            return;
        }
        quote(String.valueOf(value), out);
    }

    private static void quote(String value, StringBuilder out) {
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        out.append('"');
    }

    private static final class Parser {
        private final String s;
        private int i;
        Parser(String s) { this.s = s; }
        boolean end() { return i >= s.length(); }
        void ws() { while (!end() && Character.isWhitespace(s.charAt(i))) i++; }
        char peek() { return end() ? '\0' : s.charAt(i); }
        char next() { return end() ? '\0' : s.charAt(i++); }

        Object value() {
            ws();
            return switch (peek()) {
                case '{' -> object();
                case '[' -> array();
                case '"' -> string();
                case 't' -> literal("true", Boolean.TRUE);
                case 'f' -> literal("false", Boolean.FALSE);
                case 'n' -> literal("null", null);
                case '\0' -> throw error("Unexpected end of JSON");
                default -> number();
            };
        }

        Map<String, Object> object() {
            expect('{');
            Map<String, Object> map = new LinkedHashMap<>();
            ws();
            if (peek() == '}') { next(); return map; }
            while (true) {
                ws();
                if (peek() != '"') throw error("Object key must be a string");
                String key = string();
                ws(); expect(':');
                map.put(key, value());
                ws();
                char c = next();
                if (c == '}') return map;
                if (c != ',') throw error("Expected ',' or '}'");
            }
        }

        List<Object> array() {
            expect('[');
            List<Object> list = new ArrayList<>();
            ws();
            if (peek() == ']') { next(); return list; }
            while (true) {
                list.add(value());
                ws();
                char c = next();
                if (c == ']') return list;
                if (c != ',') throw error("Expected ',' or ']'");
            }
        }

        String string() {
            expect('"');
            StringBuilder out = new StringBuilder();
            while (!end()) {
                char c = next();
                if (c == '"') return out.toString();
                if (c == '\\') {
                    if (end()) throw error("Invalid escape sequence");
                    char e = next();
                    switch (e) {
                        case '"', '\\', '/' -> out.append(e);
                        case 'b' -> out.append('\b');
                        case 'f' -> out.append('\f');
                        case 'n' -> out.append('\n');
                        case 'r' -> out.append('\r');
                        case 't' -> out.append('\t');
                        case 'u' -> {
                            if (i + 4 > s.length()) throw error("Invalid unicode escape");
                            try { out.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); }
                            catch (NumberFormatException ex) { throw error("Invalid unicode escape"); }
                            i += 4;
                        }
                        default -> throw error("Invalid escape character");
                    }
                } else {
                    if (c < 0x20) throw error("Control character in string");
                    out.append(c);
                }
            }
            throw error("Unterminated string");
        }

        Object number() {
            int start = i;
            if (peek() == '-') next();
            if (peek() == '0') next();
            else {
                if (!Character.isDigit(peek())) throw error("Invalid JSON value");
                while (Character.isDigit(peek())) next();
            }
            boolean decimal = false;
            if (peek() == '.') {
                decimal = true; next();
                if (!Character.isDigit(peek())) throw error("Invalid number fraction");
                while (Character.isDigit(peek())) next();
            }
            if (peek() == 'e' || peek() == 'E') {
                decimal = true; next();
                if (peek() == '+' || peek() == '-') next();
                if (!Character.isDigit(peek())) throw error("Invalid number exponent");
                while (Character.isDigit(peek())) next();
            }
            String raw = s.substring(start, i);
            try { return decimal ? Double.parseDouble(raw) : Long.parseLong(raw); }
            catch (NumberFormatException ex) { throw error("Invalid number"); }
        }

        Object literal(String text, Object result) {
            if (!s.startsWith(text, i)) throw error("Invalid JSON literal");
            i += text.length();
            return result;
        }

        void expect(char c) {
            ws();
            if (next() != c) throw error("Expected '" + c + "'");
        }
        IllegalArgumentException error(String message) { return new IllegalArgumentException(message + " at position " + i); }
    }
}

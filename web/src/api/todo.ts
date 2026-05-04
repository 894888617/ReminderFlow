import request from "./request";
import type { TodayTodoResult } from "../types/todo";

export function getTodayTodos() {
    return request.get<TodayTodoResult, TodayTodoResult>("/api/todos/today");
}
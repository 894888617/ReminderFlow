import request from "./request";

export interface LoginParams {
    username: string;
    password: string;
}

export interface RegisterParams {
    username: string;
    email: string;
    password: string;
}

export interface User {
    id: number;
    username: string;
    email: string;
    created_at?: string;
}

export interface LoginResult {
    token: string;
    user: User;
}

export function login(data: LoginParams) {
    return request.post<LoginResult, LoginResult>("/api/auth/login", data);
}

export function register(data: RegisterParams) {
    return request.post("/api/auth/register", data);
}

export function getMe() {
    return request.get<User, User>("/api/users/me");
}
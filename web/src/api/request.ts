import axios from "axios";
import { message } from "antd";

const request = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "",
    timeout: 10000,
});

request.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

request.interceptors.response.use(
    (response) => {
        const res = response.data;

        if (res.code !== 0) {
            message.error(res.msg || "请求失败");
            return Promise.reject(res);
        }

        return res.data;
    },
    (error) => {
        const msg =
            error?.response?.data?.msg ||
            error?.message ||
            "网络异常，请稍后重试";

        message.error(msg);

        if (error?.response?.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "/login";
        }

        return Promise.reject(error);
    }
);

export default request;
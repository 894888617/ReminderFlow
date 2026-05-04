import type { RecordStatus } from "../types/record";

export function recordStatusText(status?: RecordStatus | string) {
    switch (status) {
        case "PENDING":
            return "待处理";
        case "IN_PROGRESS":
            return "进行中";
        case "DONE":
            return "已完成";
        case "OVERDUE":
            return "已逾期";
        case "CANCELLED":
            return "已取消";
        default:
            return status || "-";
    }
}

export function recordStatusColor(status?: RecordStatus | string) {
    switch (status) {
        case "PENDING":
            return "default";
        case "IN_PROGRESS":
            return "processing";
        case "DONE":
            return "success";
        case "OVERDUE":
            return "error";
        case "CANCELLED":
            return "warning";
        default:
            return "default";
    }
}

export const recordStatusOptions = [
    { label: "待处理", value: "PENDING" },
    { label: "进行中", value: "IN_PROGRESS" },
    { label: "已完成", value: "DONE" },
    { label: "已逾期", value: "OVERDUE" },
    { label: "已取消", value: "CANCELLED" },
];

export const recordWritableStatusOptions = [
    { label: "待处理", value: "PENDING" },
    { label: "进行中", value: "IN_PROGRESS" },
    { label: "已完成", value: "DONE" },
    { label: "已取消", value: "CANCELLED" },
];
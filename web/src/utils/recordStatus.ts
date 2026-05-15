import type { RecordStatus } from "../types/record";

export const recordStatusMap: Record<RecordStatus, { label: string; value: RecordStatus }> = {
    PENDING: { label: "待处理", value: "PENDING" },
    COMPLETED: { label: "已完成", value: "COMPLETED" },
    CANCELLED: { label: "已取消", value: "CANCELLED" },
};

export function normalizeRecordStatus(status?: RecordStatus | string | null): RecordStatus {
    const normalized = String(status || "").trim().toUpperCase();
    if (normalized === "COMPLETED" || normalized === "DONE") return "COMPLETED";
    if (normalized === "CANCELLED") return "CANCELLED";
    return "PENDING";
}

export function recordStatusText(status?: RecordStatus | string) {
    return recordStatusMap[normalizeRecordStatus(status)].label;
}

export function recordStatusColor(status?: RecordStatus | string) {
    switch (normalizeRecordStatus(status)) {
        case "COMPLETED":
            return "success";
        case "CANCELLED":
            return "warning";
        default:
            return "default";
    }
}

export const recordStatusOptions = [
    recordStatusMap.PENDING,
    recordStatusMap.COMPLETED,
    recordStatusMap.CANCELLED,
];

export const recordWritableStatusOptions = recordStatusOptions;

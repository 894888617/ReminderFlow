import { Tag } from "antd";
import type { RecordStatus } from "../types/record";
import { recordStatusColor, recordStatusText } from "../utils/recordStatus";

interface Props {
    status?: RecordStatus | string;
}

export default function RecordStatusTag({ status }: Props) {
    return (
        <Tag color={recordStatusColor(status)}>
            {recordStatusText(status)}
        </Tag>
    );
}
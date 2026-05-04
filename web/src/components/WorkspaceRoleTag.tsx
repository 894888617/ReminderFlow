import { Tag } from "antd";
import { roleColor, roleText } from "../utils/permission";

interface Props {
    role?: string;
}

export default function WorkspaceRoleTag({ role }: Props) {
    return <Tag color={roleColor(role)}>{roleText(role)}</Tag>;
}
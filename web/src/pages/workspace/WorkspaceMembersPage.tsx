import { useEffect, useMemo, useState } from "react";
import {
    Button,
    Card,
    Form,
    Input,
    message,
    Modal,
    Popconfirm,
    Select,
    Space,
    Table,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
    ArrowLeftOutlined,
    PlusOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";

import {
    addWorkspaceMember,
    getWorkspaceMembers,
    removeWorkspaceMember,
    updateMemberRole,
} from "../../api/workspace";
import type { WorkspaceMember, WorkspaceRole } from "../../types/workspace";
import WorkspaceRoleTag from "../../components/WorkspaceRoleTag";
import { canManageMembers } from "../../utils/permission";
import { useWorkspaceRole } from "../../utils/useWorkspaceRole";

const { Title, Text } = Typography;

interface InviteFormValues {
    keyword: string;
    role: "member" | "viewer";
}

export default function WorkspaceMembersPage() {
    const params = useParams();
    const navigate = useNavigate();

    const workspaceId = Number(params.id);
    const { role } = useWorkspaceRole(workspaceId);
    const manageable = canManageMembers(role);

    const [form] = Form.useForm<InviteFormValues>();

    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);

    const ownerMember = useMemo(() => {
        return members.find((item) => item.role === "owner");
    }, [members]);

    const loadMembers = async () => {
        if (!workspaceId) return;

        setLoading(true);
        try {
            const data = await getWorkspaceMembers(workspaceId);
            setMembers(data || []);
        } catch {
            // request.ts 已统一提示
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMembers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId]);

    const handleInvite = async () => {
        try {
            const values = await form.validateFields();

            setSubmitLoading(true);

            await addWorkspaceMember(workspaceId, {
                keyword: values.keyword.trim(),
                role: values.role,
            });

            message.success("邀请成员成功");
            setInviteOpen(false);
            form.resetFields();
            await loadMembers();
        } catch {
            // 表单或接口错误统一处理
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleRoleChange = async (
        member: WorkspaceMember,
        role: "member" | "viewer"
    ) => {
        try {
            await updateMemberRole(workspaceId, member.user_id, { role });
            message.success("角色修改成功");
            await loadMembers();
        } catch {
            // request.ts 已统一提示
        }
    };

    const handleRemove = async (member: WorkspaceMember) => {
        try {
            await removeWorkspaceMember(workspaceId, member.user_id);
            message.success("成员移除成功");
            await loadMembers();
        } catch {
            // request.ts 已统一提示
        }
    };

    const columns: ColumnsType<WorkspaceMember> = [
        {
            title: "用户",
            key: "user",
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.username}</Text>
                    <Text type="secondary">{record.email || "-"}</Text>
                </Space>
            ),
        },
        {
            title: "用户 ID",
            dataIndex: "user_id",
            key: "user_id",
            width: 100,
        },
        {
            title: "角色",
            dataIndex: "role",
            key: "role",
            width: 180,
            render: (role: WorkspaceRole, record) => {
                if (!manageable || role === "owner") {
                    return <WorkspaceRoleTag role={role} />;
                }

                return (
                    <Select
                        size="small"
                        value={role}
                        style={{ width: 120 }}
                        options={[
                            { label: "成员", value: "member" },
                            { label: "只读", value: "viewer" },
                        ]}
                        onChange={(value) =>
                            handleRoleChange(record, value as "member" | "viewer")
                        }
                    />
                );
            },
        },
        {
            title: "加入时间",
            dataIndex: "created_at",
            key: "created_at",
            width: 180,
            render: (value) =>
                value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-",
        },
        {
            title: "操作",
            key: "action",
            width: 160,
            render: (_, record) => {
                if (!manageable) {
                    return <Text type="secondary">无操作权限</Text>;
                }

                if (record.role === "owner") {
                    return <Text type="secondary">不可操作</Text>;
                }

                return (
                    <Popconfirm
                        title="确认移除该成员吗？"
                        description="如果该成员还有未完成任务，后端会拒绝移除。"
                        okText="确认移除"
                        cancelText="取消"
                        onConfirm={() => handleRemove(record)}
                    >
                        <Button danger size="small">
                            移除
                        </Button>
                    </Popconfirm>
                );
            },
        },
    ];

    return (
        <div>
            <Space
                style={{
                    width: "100%",
                    justifyContent: "space-between",
                    marginBottom: 24,
                }}
                align="center"
            >
                <div>
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate(`/workspaces/${workspaceId}`)}
                        style={{ marginBottom: 12 }}
                    >
                        返回空间
                    </Button>

                    <Title level={3} style={{ marginBottom: 4 }}>
                        空间成员管理
                    </Title>

                    <Text type="secondary">
                        当前空间 ID：{workspaceId}
                        {ownerMember ? `，所有者：${ownerMember.username}` : ""}
                    </Text>
                </div>

                <Space>
                    <Button icon={<ReloadOutlined />} onClick={loadMembers}>
                        刷新
                    </Button>
                    {manageable && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setInviteOpen(true)}
                        >
                            邀请成员
                        </Button>
                    )}
                </Space>
            </Space>

            <Card>
                <Table
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={members}
                    pagination={false}
                />
            </Card>

            <Modal
                title="邀请成员"
                open={inviteOpen}
                onCancel={() => {
                    setInviteOpen(false);
                    form.resetFields();
                }}
                onOk={handleInvite}
                confirmLoading={submitLoading}
                okText="邀请"
                cancelText="取消"
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        role: "member",
                    }}
                >
                    <Form.Item
                        label="用户名或邮箱"
                        name="keyword"
                        rules={[{ required: true, message: "请输入用户名或邮箱" }]}
                    >
                        <Input placeholder="例如：admin 或 admin@test.com" allowClear />
                    </Form.Item>

                    <Form.Item
                        label="成员角色"
                        name="role"
                        rules={[{ required: true, message: "请选择成员角色" }]}
                    >
                        <Select
                            options={[
                                { label: "成员：可创建和编辑记录", value: "member" },
                                { label: "只读：只能查看记录", value: "viewer" },
                            ]}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
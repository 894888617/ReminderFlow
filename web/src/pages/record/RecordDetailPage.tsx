import { useEffect, useMemo, useState } from "react";
import {
    Button,
    Card,
    DatePicker,
    Descriptions,
    Form,
    Input,
    message,
    Modal,
    Popconfirm,
    Select,
    Space,
    Spin,
    Timeline,
    Typography,
} from "antd";
import {
    ArrowLeftOutlined,
    DeleteOutlined,
    EditOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";

import {
    deleteRecord,
    getRecordDetail,
    getRecordLogs,
    transferAssignee,
    updateRecord,
    updateRecordStatus,
    type OperationLog,
} from "../../api/record";
import { createReminder } from "../../api/reminder";
import { getWorkspaceMembers } from "../../api/workspace";
import { getMe, type User } from "../../api/auth";

import type { RecordItem, RecordStatus } from "../../types/record";
import type { WorkspaceMember } from "../../types/workspace";

import RecordStatusTag from "../../components/RecordStatusTag";
import { canDeleteRecord, canWriteRecord } from "../../utils/permission";
import { useWorkspaceRole } from "../../utils/useWorkspaceRole";
import { recordWritableStatusOptions } from "../../utils/recordStatus";

const { Title, Text } = Typography;
const { TextArea } = Input;

const repeatOptions = [
    { label: "不重复", value: "NONE" },
    { label: "每天", value: "DAILY" },
    { label: "每周", value: "WEEKLY" },
    { label: "每月", value: "MONTHLY" },
];

interface EditFormValues {
    title: string;
    content?: string;
    assignee_id?: number;
    due_at?: dayjs.Dayjs;
}

interface ReminderFormValues {
    remind_at: dayjs.Dayjs;
    repeat_type: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
}

export default function RecordDetailPage() {
    const params = useParams();
    const navigate = useNavigate();

    const recordId = Number(params.id);

    const [editForm] = Form.useForm<EditFormValues>();
    const [reminderForm] = Form.useForm<ReminderFormValues>();

    const [record, setRecord] = useState<RecordItem | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [logs, setLogs] = useState<OperationLog[]>([]);
    const [loading, setLoading] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [reminderOpen, setReminderOpen] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);

    const { role } = useWorkspaceRole(record?.workspace_id);

    const writable = canWriteRecord(role);
    const deletable = canDeleteRecord(
        role,
        currentUser?.id === record?.creator_id
    );

    const memberOptions = useMemo(() => {
        return members.map((item) => ({
            label: `${item.username}${item.email ? `（${item.email}）` : ""}`,
            value: item.user_id,
        }));
    }, [members]);

    const loadDetail = async () => {
        if (!recordId) return;

        setLoading(true);
        try {
            const [recordData, me] = await Promise.all([
                getRecordDetail(recordId),
                getMe(),
            ]);

            setRecord(recordData);
            setCurrentUser(me);

            const [memberData, logData] = await Promise.all([
                getWorkspaceMembers(recordData.workspace_id),
                getRecordLogs(recordId),
            ]);

            setMembers(memberData || []);
            setLogs(logData || []);
        } catch {
            // request.ts 已统一提示
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDetail();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordId]);

    const openEdit = () => {
        if (!record) return;

        editForm.setFieldsValue({
            title: record.title,
            content: record.content,
            assignee_id: record.assignee_id || undefined,
            due_at: record.due_at ? dayjs(record.due_at) : undefined,
        });

        setEditOpen(true);
    };

    const handleEdit = async () => {
        if (!record) return;

        try {
            const values = await editForm.validateFields();
            setSubmitLoading(true);

            await updateRecord(record.id, {
                title: values.title.trim(),
                content: values.content?.trim() || "",
                assignee_id: values.assignee_id,
                due_at: values.due_at ? values.due_at.toISOString() : undefined,
            });

            message.success("更新成功");
            setEditOpen(false);
            await loadDetail();
        } catch {
            // 表单或接口错误
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!record) return;

        try {
            await deleteRecord(record.id);
            message.success("删除成功");
            navigate(`/workspaces/${record.workspace_id}`);
        } catch {
            // request.ts 已统一提示
        }
    };

    const handleStatusChange = async (status: RecordStatus) => {
        if (!record) return;

        try {
            await updateRecordStatus(record.id, status);
            message.success("状态更新成功");
            await loadDetail();
        } catch {
            // request.ts 已统一提示
        }
    };

    const handleTransferAssignee = async (assigneeId: number) => {
        if (!record) return;

        try {
            await transferAssignee(record.id, assigneeId);
            message.success("负责人转交成功");
            await loadDetail();
        } catch {
            // request.ts 已统一提示
        }
    };

    const handleCreateReminder = async () => {
        if (!record) return;

        try {
            const values = await reminderForm.validateFields();
            setSubmitLoading(true);

            await createReminder(record.id, {
                remind_at: values.remind_at.toISOString(),
                repeat_type: values.repeat_type || "NONE",
            });

            message.success("提醒设置成功");
            setReminderOpen(false);
            reminderForm.resetFields();
        } catch {
            // request.ts 已统一提示
        } finally {
            setSubmitLoading(false);
        }
    };

    if (loading && !record) {
        return <Spin />;
    }

    if (!record) {
        return <Text type="secondary">记录不存在或无权限查看</Text>;
    }

    return (
        <div>
            <Space
                style={{
                    width: "100%",
                    justifyContent: "space-between",
                    marginBottom: 24,
                }}
                align="start"
            >
                <Space direction="vertical" size={4}>
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate(`/workspaces/${record.workspace_id}`)}
                    >
                        返回空间
                    </Button>

                    <Title level={3} style={{ marginBottom: 0 }}>
                        {record.title}
                    </Title>

                    <Text type="secondary">
                        记录 ID：{record.id}，你的角色：{role || "-"}
                    </Text>
                </Space>

                <Space>
                    <Button icon={<ReloadOutlined />} onClick={loadDetail}>
                        刷新
                    </Button>

                    {writable && (
                        <Button onClick={() => setReminderOpen(true)}>设置提醒</Button>
                    )}

                    {writable && (
                        <Button icon={<EditOutlined />} type="primary" onClick={openEdit}>
                            编辑
                        </Button>
                    )}

                    {deletable && (
                        <Popconfirm
                            title="确认删除这条记录吗？"
                            description="删除后不可恢复。"
                            okText="确认删除"
                            cancelText="取消"
                            onConfirm={handleDelete}
                        >
                            <Button danger icon={<DeleteOutlined />}>
                                删除
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            </Space>

            <Card style={{ marginBottom: 16 }}>
                <Descriptions bordered column={2}>
                    <Descriptions.Item label="标题" span={2}>
                        {record.title}
                    </Descriptions.Item>

                    <Descriptions.Item label="内容" span={2}>
                        {record.content || "-"}
                    </Descriptions.Item>

                    <Descriptions.Item label="状态">
                        {writable ? (
                            <Select
                                value={record.status}
                                style={{ width: 160 }}
                                options={recordWritableStatusOptions}
                                onChange={(value) => handleStatusChange(value as RecordStatus)}
                            />
                        ) : (
                            <RecordStatusTag status={record.status} />
                        )}
                    </Descriptions.Item>

                    <Descriptions.Item label="负责人">
                        {writable ? (
                            <Select
                                allowClear
                                value={record.assignee_id || undefined}
                                style={{ width: 240 }}
                                options={memberOptions}
                                placeholder="未分配"
                                onChange={(value) => {
                                    if (value) {
                                        handleTransferAssignee(value);
                                    }
                                }}
                            />
                        ) : (
                            record.assignee_name || "-"
                        )}
                    </Descriptions.Item>

                    <Descriptions.Item label="截止时间">
                        {record.due_at
                            ? dayjs(record.due_at).format("YYYY-MM-DD HH:mm")
                            : "-"}
                    </Descriptions.Item>

                    <Descriptions.Item label="创建时间">
                        {record.created_at
                            ? dayjs(record.created_at).format("YYYY-MM-DD HH:mm")
                            : "-"}
                    </Descriptions.Item>

                    <Descriptions.Item label="更新时间">
                        {record.updated_at
                            ? dayjs(record.updated_at).format("YYYY-MM-DD HH:mm")
                            : "-"}
                    </Descriptions.Item>

                    <Descriptions.Item label="空间 ID">
                        {record.workspace_id}
                    </Descriptions.Item>
                </Descriptions>
            </Card>

            <Card title="操作日志">
                {logs.length === 0 ? (
                    <Text type="secondary">暂无操作日志</Text>
                ) : (
                    <Timeline
                        items={logs.map((log) => ({
                            children: (
                                <div>
                                    <div>
                                        <Text strong>{log.action}</Text>
                                        <span style={{ marginLeft: 8 }}>{log.detail}</span>
                                    </div>
                                    <Text type="secondary">
                                        {log.username || "系统"} ·{" "}
                                        {dayjs(log.created_at).format("YYYY-MM-DD HH:mm:ss")}
                                    </Text>
                                </div>
                            ),
                        }))}
                    />
                )}
            </Card>

            <Modal
                title="编辑记录"
                open={editOpen}
                onCancel={() => setEditOpen(false)}
                onOk={handleEdit}
                confirmLoading={submitLoading}
                okText="保存"
                cancelText="取消"
                width={640}
                destroyOnClose
            >
                <Form form={editForm} layout="vertical">
                    <Form.Item
                        label="标题"
                        name="title"
                        rules={[
                            { required: true, message: "请输入记录标题" },
                            { max: 200, message: "标题不能超过 200 个字符" },
                        ]}
                    >
                        <Input allowClear />
                    </Form.Item>

                    <Form.Item label="内容" name="content">
                        <TextArea rows={4} allowClear />
                    </Form.Item>

                    <Form.Item label="负责人" name="assignee_id">
                        <Select allowClear options={memberOptions} />
                    </Form.Item>

                    <Form.Item label="截止时间" name="due_at">
                        <DatePicker showTime style={{ width: "100%" }} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="设置提醒"
                open={reminderOpen}
                onCancel={() => {
                    setReminderOpen(false);
                    reminderForm.resetFields();
                }}
                onOk={handleCreateReminder}
                confirmLoading={submitLoading}
                okText="保存"
                cancelText="取消"
                destroyOnClose
            >
                <Form
                    form={reminderForm}
                    layout="vertical"
                    initialValues={{
                        repeat_type: "NONE",
                    }}
                >
                    <Form.Item
                        label="提醒时间"
                        name="remind_at"
                        rules={[{ required: true, message: "请选择提醒时间" }]}
                    >
                        <DatePicker showTime style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item label="重复提醒" name="repeat_type">
                        <Select
                            options={[
                                { label: "不重复", value: "NONE" },
                                { label: "每天", value: "DAILY" },
                                { label: "每周", value: "WEEKLY" },
                                { label: "每月", value: "MONTHLY" },
                            ]}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
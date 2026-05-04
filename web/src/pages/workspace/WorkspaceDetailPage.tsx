import { useEffect, useMemo, useState } from "react";
import {
    Button,
    DatePicker,
    Form,
    Input,
    message,
    Modal,
    Select,
    Space,
    Table,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";

import { createRecord, getRecords, updateRecordStatus } from "../../api/record";
import { getWorkspaceMembers } from "../../api/workspace";
import { createReminder } from "../../api/reminder";
import type { PageResult, RecordItem, RecordStatus } from "../../types/record";
import type { WorkspaceMember } from "../../types/workspace";
import RecordStatusTag from "../../components/RecordStatusTag";
import { canManageMembers, canWriteRecord } from "../../utils/permission";
import { useWorkspaceRole } from "../../utils/useWorkspaceRole";
import {
    recordStatusOptions,
    recordWritableStatusOptions,
} from "../../utils/recordStatus";
import PageHeader from "../../components/PageHeader.tsx";

const { Title, Text } = Typography;
const { TextArea } = Input;

const repeatOptions = [
    { label: "不重复", value: "NONE" },
    { label: "每天", value: "DAILY" },
    { label: "每周", value: "WEEKLY" },
    { label: "每月", value: "MONTHLY" },
];

interface SearchFormValues {
    keyword?: string;
    status?: RecordStatus | "";
    assignee_id?: number;
}

interface CreateRecordFormValues {
    title: string;
    content?: string;
    assignee_id?: number;
    due_at?: dayjs.Dayjs;
    remind_at?: dayjs.Dayjs;
    repeat_type?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
}

export default function WorkspaceDetailPage() {
    const navigate = useNavigate();
    const params = useParams();

    const workspaceId = Number(params.id);

    const { role } = useWorkspaceRole(workspaceId);
    const writable = canWriteRecord(role);
    const manageable = canManageMembers(role);

    const [searchForm] = Form.useForm<SearchFormValues>();
    const [createForm] = Form.useForm<CreateRecordFormValues>();

    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [records, setRecords] = useState<RecordItem[]>([]);
    const [loading, setLoading] = useState(false);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    const [createOpen, setCreateOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);

    const memberOptions = useMemo(() => {
        return members.map((item) => ({
            label: `${item.username}${item.email ? `（${item.email}）` : ""}`,
            value: item.user_id,
        }));
    }, [members]);

    const loadMembers = async () => {
        if (!workspaceId) return;

        try {
            const data = await getWorkspaceMembers(workspaceId);
            setMembers(data || []);
        } catch {
            // request.ts 已统一提示
        }
    };

    const loadRecords = async (
        nextPage = page,
        nextPageSize = pageSize,
        values?: SearchFormValues
    ) => {
        if (!workspaceId) return;

        const formValues = values || searchForm.getFieldsValue();

        setLoading(true);
        try {
            const data: PageResult<RecordItem> = await getRecords({
                workspace_id: workspaceId,
                page: nextPage,
                page_size: nextPageSize,
                keyword: formValues.keyword?.trim() || undefined,
                status: formValues.status || "",
                assignee_id: formValues.assignee_id,
            });

            setRecords(data.items || []);
            setTotal(data.total || 0);
            setPage(data.page || nextPage);
            setPageSize(data.page_size || nextPageSize);
        } catch {
            // request.ts 已统一提示
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMembers();
        loadRecords(1, pageSize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId]);

    const handleSearch = async () => {
        await loadRecords(1, pageSize);
    };

    const handleReset = async () => {
        searchForm.resetFields();
        await loadRecords(1, pageSize, {});
    };

    const handleCreate = async () => {
        try {
            const values = await createForm.validateFields();
            setCreateLoading(true);

            const record = await createRecord({
                workspace_id: workspaceId,
                title: values.title.trim(),
                content: values.content?.trim() || "",
                assignee_id: values.assignee_id,
                due_at: values.due_at ? values.due_at.toISOString() : undefined,
            });

            if (values.remind_at) {
                await createReminder(record.id, {
                    remind_at: values.remind_at.toISOString(),
                    repeat_type: values.repeat_type || "NONE",
                });
            }

            message.success("创建记录成功");
            setCreateOpen(false);
            createForm.resetFields();
            await loadRecords(1, pageSize);
        } catch {
            // 表单或接口错误
        } finally {
            setCreateLoading(false);
        }
    };

    const handleStatusChange = async (record: RecordItem, status: RecordStatus) => {
        try {
            await updateRecordStatus(record.id, status);
            message.success("状态更新成功");
            await loadRecords(page, pageSize);
        } catch {
            // request.ts 已统一提示
        }
    };

    const columns: ColumnsType<RecordItem> = [
        {
            title: "标题",
            dataIndex: "title",
            key: "title",
            render: (_, record) => (
                <Button type="link" onClick={() => navigate(`/records/${record.id}`)}>
                    {record.title}
                </Button>
            ),
        },
        {
            title: "负责人",
            dataIndex: "assignee_name",
            key: "assignee_name",
            width: 140,
            render: (value) => value || "-",
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 120,
            render: (status: RecordStatus) => <RecordStatusTag status={status} />,
        },
        {
            title: "截止时间",
            dataIndex: "due_at",
            key: "due_at",
            width: 180,
            render: (value) =>
                value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-",
        },
        {
            title: "创建时间",
            dataIndex: "created_at",
            key: "created_at",
            width: 180,
            render: (value) =>
                value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-",
        },
        {
            title: "操作",
            key: "action",
            width: 240,
            render: (_, record) => (
                <Space>
                    {writable ? (
                        <Select
                            size="small"
                            value={record.status}
                            style={{ width: 120 }}
                            options={recordWritableStatusOptions}
                            onChange={(value) =>
                                handleStatusChange(record, value as RecordStatus)
                            }
                        />
                    ) : (
                        <RecordStatusTag status={record.status} />
                    )}

                    <Button size="small" onClick={() => navigate(`/records/${record.id}`)}>
                        详情
                    </Button>
                </Space>
            ),
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
                    <Title level={3} style={{ marginBottom: 4 }}>
                        空间详情 / 记录列表
                    </Title>
                    <Text type="secondary">
                        当前空间 ID：{workspaceId}，你的角色：{role || "-"}
                    </Text>
                </div>

                <Space>
                    {manageable && (
                        <Button onClick={() => navigate(`/workspaces/${workspaceId}/members`)}>
                            成员管理
                        </Button>
                    )}

                    {writable && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setCreateOpen(true)}
                        >
                            新建记录
                        </Button>
                    )}
                </Space>
            </Space>

            <Form
                form={searchForm}
                layout="inline"
                initialValues={{ status: "" }}
                style={{ marginBottom: 16 }}
            >
                <Form.Item name="keyword">
                    <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="搜索标题/内容"
                        style={{ width: 220 }}
                        onPressEnter={handleSearch}
                    />
                </Form.Item>

                <Form.Item name="status">
                    <Select
                        style={{ width: 140 }}
                        options={[{ label: "全部", value: "" }, ...recordStatusOptions]}
                    />
                </Form.Item>

                <Form.Item name="assignee_id">
                    <Select
                        allowClear
                        placeholder="负责人"
                        style={{ width: 220 }}
                        options={memberOptions}
                    />
                </Form.Item>

                <Form.Item>
                    <Space>
                        <Button type="primary" onClick={handleSearch}>
                            查询
                        </Button>
                        <Button onClick={handleReset}>重置</Button>
                        <Button icon={<ReloadOutlined />} onClick={() => loadRecords()}>
                            刷新
                        </Button>
                    </Space>
                </Form.Item>
            </Form>

            <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={records}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showTotal: (value) => `共 ${value} 条`,
                    onChange: (nextPage, nextPageSize) => {
                        loadRecords(nextPage, nextPageSize);
                    },
                }}
            />

            <Modal
                title="新建协同记录"
                open={createOpen}
                onCancel={() => {
                    setCreateOpen(false);
                    createForm.resetFields();
                }}
                onOk={handleCreate}
                confirmLoading={createLoading}
                okText="创建"
                cancelText="取消"
                width={640}
                destroyOnClose
            >
                <Form
                    form={createForm}
                    layout="vertical"
                    initialValues={{ repeat_type: "NONE" }}
                >
                    <Form.Item
                        label="标题"
                        name="title"
                        rules={[
                            { required: true, message: "请输入标题" },
                            { max: 200, message: "标题不能超过 200 个字符" },
                        ]}
                    >
                        <Input allowClear placeholder="例如：完成客户需求确认" />
                    </Form.Item>

                    <Form.Item label="内容" name="content">
                        <TextArea rows={4} allowClear placeholder="补充说明" />
                    </Form.Item>

                    <Form.Item label="负责人" name="assignee_id">
                        <Select allowClear options={memberOptions} placeholder="请选择负责人" />
                    </Form.Item>

                    <Form.Item label="截止时间" name="due_at">
                        <DatePicker showTime style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item label="提醒时间" name="remind_at">
                        <DatePicker showTime style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item label="重复提醒" name="repeat_type">
                        <Select options={repeatOptions} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
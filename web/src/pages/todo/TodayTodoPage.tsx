import { useEffect, useState } from "react";
import {
    Button,
    Card,
    Empty,
    Space,
    Table,
    Tabs,
    Tag,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { getTodayTodos } from "../../api/todo";
import type { RecordItem, RecordStatus } from "../../types/record";
import type { TodoReminder, TodayTodoResult } from "../../types/todo";

const { Title, Text } = Typography;

function statusText(status: RecordStatus) {
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
            return status;
    }
}

function statusColor(status: RecordStatus) {
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

function repeatTypeText(type: string) {
    switch (type) {
        case "NONE":
            return "不重复";
        case "DAILY":
            return "每天";
        case "WEEKLY":
            return "每周";
        case "MONTHLY":
            return "每月";
        default:
            return type;
    }
}

export default function TodayTodoPage() {
    const navigate = useNavigate();

    const [data, setData] = useState<TodayTodoResult | null>(null);
    const [loading, setLoading] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await getTodayTodos();
            setData(res);
        } catch {
            // request.ts 已统一提示
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const recordColumns: ColumnsType<RecordItem> = [
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
            render: (status: RecordStatus) => (
                <Tag color={statusColor(status)}>{statusText(status)}</Tag>
            ),
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
    ];

    const reminderColumns: ColumnsType<TodoReminder> = [
        {
            title: "记录",
            dataIndex: "record_title",
            key: "record_title",
            render: (_, record) => (
                <Button
                    type="link"
                    onClick={() => navigate(`/records/${record.record_id}`)}
                >
                    {record.record_title}
                </Button>
            ),
        },
        {
            title: "提醒时间",
            dataIndex: "remind_at",
            key: "remind_at",
            width: 180,
            render: (value) =>
                value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-",
        },
        {
            title: "重复类型",
            dataIndex: "repeat_type",
            key: "repeat_type",
            width: 120,
            render: (value) => <Tag>{repeatTypeText(value)}</Tag>,
        },
        {
            title: "是否已通知",
            dataIndex: "notified",
            key: "notified",
            width: 120,
            render: (value) =>
                value ? <Tag color="success">已通知</Tag> : <Tag>未通知</Tag>,
        },
    ];

    const dueToday = data?.due_today || [];
    const remindersToday = data?.reminders_today || [];
    const unfinished = data?.unfinished || [];

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
                        今日待办
                    </Title>
                    <Text type="secondary">
                        {data?.date
                            ? `日期：${data.date}`
                            : "查看今天截止、今天提醒和未完成任务。"}
                    </Text>
                </div>

                <Button icon={<ReloadOutlined />} onClick={loadData}>
                    刷新
                </Button>
            </Space>

            <Space size={16} style={{ marginBottom: 16 }}>
                <Card size="small">
                    <Text type="secondary">今日截止</Text>
                    <Title level={3} style={{ margin: 0 }}>
                        {dueToday.length}
                    </Title>
                </Card>

                <Card size="small">
                    <Text type="secondary">今日提醒</Text>
                    <Title level={3} style={{ margin: 0 }}>
                        {remindersToday.length}
                    </Title>
                </Card>

                <Card size="small">
                    <Text type="secondary">未完成任务</Text>
                    <Title level={3} style={{ margin: 0 }}>
                        {unfinished.length}
                    </Title>
                </Card>
            </Space>

            <Card>
                <Tabs
                    items={[
                        {
                            key: "due_today",
                            label: `今日截止 ${dueToday.length}`,
                            children:
                                dueToday.length === 0 ? (
                                    <Empty description="暂无今日截止任务" />
                                ) : (
                                    <Table
                                        rowKey="id"
                                        loading={loading}
                                        columns={recordColumns}
                                        dataSource={dueToday}
                                        pagination={false}
                                    />
                                ),
                        },
                        {
                            key: "reminders_today",
                            label: `今日提醒 ${remindersToday.length}`,
                            children:
                                remindersToday.length === 0 ? (
                                    <Empty description="暂无今日提醒" />
                                ) : (
                                    <Table
                                        rowKey="id"
                                        loading={loading}
                                        columns={reminderColumns}
                                        dataSource={remindersToday}
                                        pagination={false}
                                    />
                                ),
                        },
                        {
                            key: "unfinished",
                            label: `未完成 ${unfinished.length}`,
                            children:
                                unfinished.length === 0 ? (
                                    <Empty description="暂无未完成任务" />
                                ) : (
                                    <Table
                                        rowKey="id"
                                        loading={loading}
                                        columns={recordColumns}
                                        dataSource={unfinished}
                                        pagination={{
                                            pageSize: 10,
                                            showSizeChanger: false,
                                        }}
                                    />
                                ),
                        },
                    ]}
                />
            </Card>
        </div>
    );
}
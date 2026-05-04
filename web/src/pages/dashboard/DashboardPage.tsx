import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { getTodayTodos } from "../../api/todo";
import { getNotifications } from "../../api/notification";
import { getWorkspaces } from "../../api/workspace";
import { getOverdueRecords } from "../../api/record";

import type { TodayTodoResult } from "../../types/todo";
import type { NotificationItem } from "../../types/notification";
import type { Workspace } from "../../types/workspace";
import type { RecordItem } from "../../types/record";

const { Title, Text } = Typography;

export default function DashboardPage() {
    const navigate = useNavigate();

    const [today, setToday] = useState<TodayTodoResult | null>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [overdue, setOverdue] = useState<RecordItem[]>([]);
    const [loading, setLoading] = useState(false);

    const unreadCount = useMemo(() => {
        return notifications.filter((item) => !item.read).length;
    }, [notifications]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [todayData, notificationData, workspaceData, overdueData] =
                await Promise.all([
                    getTodayTodos(),
                    getNotifications(),
                    getWorkspaces(),
                    getOverdueRecords(),
                ]);

            setToday(todayData);
            setNotifications(notificationData || []);
            setWorkspaces(workspaceData || []);
            setOverdue(overdueData || []);
        } catch {
            // request.ts 已统一提示
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const dueTodayCount = today?.due_today?.length || 0;
    const remindersTodayCount = today?.reminders_today?.length || 0;
    const unfinishedCount = today?.unfinished?.length || 0;

    // @ts-ignore
    return (
        <div>
            <Space
                style={{
                    width: "100%",
                    justifyContent: "space-between",
                    marginBottom: 24,
                }}
            >
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>
                        工作台
                    </Title>
                    <Text type="secondary">
                        汇总今日待办、逾期任务、通知和协作空间。
                    </Text>
                </div>

                <Button onClick={loadData}>刷新</Button>
            </Space>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card loading={loading}>
                        <Statistic
                            title="今日截止"
                            value={dueTodayCount}
                            suffix="项"
                            valueStyle={{ cursor: "pointer" }}
                            onClick={() => navigate("/todos/today")}
                        />
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={6}>
                    <Card loading={loading}>
                        <Statistic
                            title="今日提醒"
                            value={remindersTodayCount}
                            suffix="项"
                            valueStyle={{ cursor: "pointer" }}
                            onClick={() => navigate("/todos/today")}
                        />
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={6}>
                    <Card loading={loading}>
                        <Statistic
                            title="未完成任务"
                            value={unfinishedCount}
                            suffix="项"
                            valueStyle={{ cursor: "pointer" }}
                            onClick={() => navigate("/todos/today")}
                        />
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={6}>
                    <Card loading={loading}>
                        <Statistic
                            title="逾期任务"
                            value={overdue.length}
                            suffix="项"
                            valueStyle={{
                                cursor: "pointer",
                                color: overdue.length > 0 ? "#cf1322" : undefined,
                            }}
                            onClick={() => navigate("/records/overdue")}></Statistic>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                    <Card
                        title="我的协作空间"
                        extra={<Button type="link" onClick={() => navigate("/workspaces")}>查看全部</Button>}
                    >
                        {workspaces.length === 0 ? (
                            <Empty description="暂无协作空间" />
                        ) : (
                            <List
                                dataSource={workspaces.slice(0, 5)}
                                renderItem={(item) => (
                                    <List.Item
                                        actions={[
                                            <Button
                                                type="link"
                                                onClick={() => navigate(`/workspaces/${item.id}`)}
                                            >
                                                进入
                                            </Button>,
                                        ]}
                                    >
                                        <List.Item.Meta
                                            title={
                                                <Space>
                                                    <span>{item.name}</span>
                                                    <Tag>{item.role}</Tag>
                                                </Space>
                                            }
                                            description={`创建时间：${
                                                item.created_at
                                                    ? dayjs(item.created_at).format("YYYY-MM-DD HH:mm")
                                                    : "-"
                                            }`}
                                        />
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </Col>

                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                通知中心
                                <Badge count={unreadCount} />
                            </Space>
                        }
                        extra={<Button type="link" onClick={() => navigate("/notifications")}>查看全部</Button>}
                    >
                        {notifications.length === 0 ? (
                            <Empty description="暂无通知" />
                        ) : (
                            <List
                                dataSource={notifications.slice(0, 5)}
                                renderItem={(item) => (
                                    <List.Item
                                        actions={[
                                            item.record_id ? (
                                                <Button
                                                    type="link"
                                                    onClick={() => navigate(`/records/${item.record_id}`)}
                                                >
                                                    查看记录
                                                </Button>
                                            ) : null,
                                        ].filter(Boolean)}
                                    >
                                        <List.Item.Meta
                                            title={
                                                <Space>
                                                    {!item.read && <Badge status="processing" />}
                                                    <Text strong={!item.read}>{item.title}</Text>
                                                </Space>
                                            }
                                            description={
                                                <Space direction="vertical" size={2}>
                                                    <Text>{item.content}</Text>
                                                    <Text type="secondary">
                                                        {item.created_at
                                                            ? dayjs(item.created_at).format("YYYY-MM-DD HH:mm")
                                                            : "-"}
                                                    </Text>
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </Col>

                <Col xs={24}>
                    <Card
                        title="逾期任务预览"
                        extra={<Button type="link" onClick={() => navigate("/records/overdue")}>查看全部</Button>}
                    >
                        {overdue.length === 0 ? (
                            <Empty description="暂无逾期任务" />
                        ) : (
                            <List
                                dataSource={overdue.slice(0, 5)}
                                renderItem={(item) => (
                                    <List.Item
                                        actions={[
                                            <Button
                                                type="link"
                                                onClick={() => navigate(`/records/${item.id}`)}
                                            >
                                                详情
                                            </Button>,
                                        ]}
                                    >
                                        <List.Item.Meta
                                            title={
                                                <Space>
                                                    <Text strong>{item.title}</Text>
                                                    <Tag color="error">已逾期</Tag>
                                                </Space>
                                            }
                                            description={`截止时间：${
                                                item.due_at
                                                    ? dayjs(item.due_at).format("YYYY-MM-DD HH:mm")
                                                    : "-"
                                            }`}
                                        />
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
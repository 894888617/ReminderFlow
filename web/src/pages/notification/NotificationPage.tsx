import { useEffect, useMemo, useState } from "react";
import {
    Badge,
    Button,
    Card,
    Empty,
    List,
    message,
    Space,
    Tag,
    Typography,
} from "antd";
import { CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import {
    getNotifications,
    markNotificationRead,
} from "../../api/notification";
import type { NotificationItem } from "../../types/notification";

const { Title, Text } = Typography;

function notificationTag(title: string) {
    if (title.includes("逾期")) {
        return <Tag color="error">逾期</Tag>;
    }

    if (title.includes("提醒")) {
        return <Tag color="processing">提醒</Tag>;
    }

    if (title.includes("负责人")) {
        return <Tag color="blue">负责人</Tag>;
    }

    return <Tag>系统</Tag>;
}

export default function NotificationPage() {
    const navigate = useNavigate();

    const [list, setList] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(false);

    const unreadCount = useMemo(() => {
        return list.filter((item) => !item.read).length;
    }, [list]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getNotifications();
            setList(data || []);
        } catch {
            // request.ts 已统一提示
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleMarkRead = async (item: NotificationItem) => {
        try {
            await markNotificationRead(item.id);
            message.success("已标记为已读");
            await loadData();
        } catch {
            // request.ts 已统一提示
        }
    };

    const handleOpenRecord = async (item: NotificationItem) => {
        if (!item.read) {
            try {
                await markNotificationRead(item.id);
            } catch {
                // 忽略，继续跳转
            }
        }

        if (item.record_id) {
            navigate(`/records/${item.record_id}`);
        }
    };

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
                        通知中心
                    </Title>
                    <Text type="secondary">
                        当前未读通知：<Badge count={unreadCount} />
                    </Text>
                </div>

                <Button icon={<ReloadOutlined />} onClick={loadData}>
                    刷新
                </Button>
            </Space>

            <Card>
                {list.length === 0 && !loading ? (
                    <Empty description="暂无通知" />
                ) : (
                    <List
                        loading={loading}
                        dataSource={list}
                        renderItem={(item) => (
                            <List.Item
                                actions={[
                                    item.record_id ? (
                                        <Button type="link" onClick={() => handleOpenRecord(item)}>
                                            查看记录
                                        </Button>
                                    ) : null,
                                    !item.read ? (
                                        <Button
                                            type="link"
                                            icon={<CheckOutlined />}
                                            onClick={() => handleMarkRead(item)}
                                        >
                                            标记已读
                                        </Button>
                                    ) : (
                                        <Tag color="success">已读</Tag>
                                    ),
                                ].filter(Boolean)}
                            >
                                <List.Item.Meta
                                    title={
                                        <Space>
                                            {!item.read && <Badge status="processing" />}
                                            {notificationTag(item.title)}
                                            <Text strong={!item.read}>{item.title}</Text>
                                        </Space>
                                    }
                                    description={
                                        <Space direction="vertical" size={4}>
                                            <Text>{item.content || "-"}</Text>
                                            <Text type="secondary">
                                                {item.created_at
                                                    ? dayjs(item.created_at).format(
                                                        "YYYY-MM-DD HH:mm:ss"
                                                    )
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
        </div>
    );
}
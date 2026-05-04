import { useEffect, useMemo, useState } from "react";
import {
    DashboardOutlined,
    BellOutlined,
    FolderOpenOutlined,
    CalendarOutlined,
    WarningOutlined,
    SettingOutlined,
} from "@ant-design/icons";
import { Badge, Button, Layout, Menu, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { getNotifications } from "../api/notification";
import type { NotificationItem } from "../types/notification";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function AuthLayout() {
    const navigate = useNavigate();
    const location = useLocation();

    const [notifications, setNotifications] = useState<NotificationItem[]>([]);

    const unreadCount = useMemo(() => {
        return notifications.filter((item) => !item.read).length;
    }, [notifications]);

    const loadNotifications = async () => {
        try {
            const data = await getNotifications();
            setNotifications(data || []);
        } catch {
            // request.ts 已统一处理错误
        }
    };

    useEffect(() => {
        loadNotifications();

        const timer = window.setInterval(() => {
            loadNotifications();
        }, 30000);

        return () => {
            window.clearInterval(timer);
        };
    }, []);

    const logout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    const selectedKey = (() => {
        if (location.pathname.startsWith("/workspaces")) {
            return "/workspaces";
        }

        if (location.pathname.startsWith("/records/overdue")) {
            return "/records/overdue";
        }

        if (location.pathname.startsWith("/todos/today")) {
            return "/todos/today";
        }

        if (location.pathname.startsWith("/notifications")) {
            return "/notifications";
        }

        if (location.pathname.startsWith("/settings")) {
            return "/settings";
        }

        return location.pathname;
    })();

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <Sider theme="dark">
                <div
                    style={{
                        color: "#fff",
                        fontSize: 18,
                        fontWeight: 600,
                        padding: 16,
                    }}
                >
                    轻记协同
                </div>

                <Menu
                    theme="dark"
                    mode="inline"
                    selectedKeys={[selectedKey]}
                    onClick={(item) => navigate(item.key)}
                    items={[
                        {
                            key: "/dashboard",
                            icon: <DashboardOutlined />,
                            label: "工作台",
                        },
                        {
                            key: "/todos/today",
                            icon: <CalendarOutlined />,
                            label: "今日待办",
                        },
                        {
                            key: "/workspaces",
                            icon: <FolderOpenOutlined />,
                            label: "我的空间",
                        },
                        {
                            key: "/records/overdue",
                            icon: <WarningOutlined />,
                            label: "逾期任务",
                        },
                        {
                            key: "/notifications",
                            icon: <BellOutlined />,
                            label: (
                                <span>
                  通知中心{" "}
                                    {unreadCount > 0 && (
                                        <Badge
                                            count={unreadCount}
                                            size="small"
                                            style={{ marginLeft: 6 }}
                                        />
                                    )}
                </span>
                            ),
                        },
                        {
                            key: "/settings",
                            icon: <SettingOutlined />,
                            label: "设置",
                        },
                    ]}
                />
            </Sider>

            <Layout>
                <Header
                    style={{
                        background: "#fff",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0 24px",
                    }}
                >
                    <Text type="secondary">ReminderFlow / 轻记协同</Text>

                    <Button onClick={logout}>退出登录</Button>
                </Header>

                <Content style={{ margin: 24, background: "#fff", padding: 24 }}>
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
}
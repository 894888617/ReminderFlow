import { useEffect, useState } from "react";
import {
    Button,
    Card,
    Descriptions,
    message,
    Popconfirm,
    Space,
    Typography,
} from "antd";
import { LogoutOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import { getMe, type User } from "../../api/auth";

const { Title, Text, Paragraph } = Typography;

export default function SettingsPage() {
    const navigate = useNavigate();

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(false);

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

    const loadUser = async () => {
        setLoading(true);
        try {
            const data = await getMe();
            setUser(data);
        } catch {
            // request.ts 已统一提示
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUser();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        message.success("已退出登录");
        navigate("/login");
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
                        设置
                    </Title>
                    <Text type="secondary">查看账号信息、系统配置和退出登录。</Text>
                </div>

                <Button icon={<ReloadOutlined />} onClick={loadUser} loading={loading}>
                    刷新
                </Button>
            </Space>

            <Card title="账号信息" style={{ marginBottom: 16 }} loading={loading}>
                <Descriptions bordered column={1}>
                    <Descriptions.Item label="用户 ID">
                        {user?.id || "-"}
                    </Descriptions.Item>

                    <Descriptions.Item label="用户名">
                        {user?.username || "-"}
                    </Descriptions.Item>

                    <Descriptions.Item label="邮箱">
                        {user?.email || "-"}
                    </Descriptions.Item>

                    <Descriptions.Item label="注册时间">
                        {user?.created_at || "-"}
                    </Descriptions.Item>
                </Descriptions>
            </Card>

            <Card title="系统信息" style={{ marginBottom: 16 }}>
                <Descriptions bordered column={1}>
                    <Descriptions.Item label="产品名称">轻记协同</Descriptions.Item>
                    <Descriptions.Item label="前端技术栈">
                        React + TypeScript + Vite + Ant Design
                    </Descriptions.Item>
                    <Descriptions.Item label="后端技术栈">
                        Go + Gin + PostgreSQL
                    </Descriptions.Item>
                    <Descriptions.Item label="API 地址">
                        {apiBaseUrl || "同源代理模式"}
                    </Descriptions.Item>
                    <Descriptions.Item label="当前版本">MVP v1.0</Descriptions.Item>
                </Descriptions>
            </Card>

            <Card title="账号操作">
                <Paragraph type="secondary">
                    退出登录会清除本地 token，需要重新登录后才能继续使用系统。
                </Paragraph>

                <Popconfirm
                    title="确认退出登录吗？"
                    okText="确认退出"
                    cancelText="取消"
                    onConfirm={handleLogout}
                >
                    <Button danger icon={<LogoutOutlined />}>
                        退出登录
                    </Button>
                </Popconfirm>
            </Card>
        </div>
    );
}
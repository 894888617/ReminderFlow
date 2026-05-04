import { useEffect, useState } from "react";
import {
    Button,
    Card,
    Col,
    Empty,
    Form,
    Input,
    message,
    Modal,
    Row,
    Space,
    Tag,
    Typography,
} from "antd";
import {
    PlusOutlined,
    TeamOutlined,
    ArrowRightOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { createWorkspace, getWorkspaces } from "../../api/workspace";
import type { Workspace } from "../../types/workspace";

const { Title, Text } = Typography;

function roleText(role: string) {
    switch (role) {
        case "owner":
            return "所有者";
        case "member":
            return "成员";
        case "viewer":
            return "只读";
        default:
            return role;
    }
}

function roleColor(role: string) {
    switch (role) {
        case "owner":
            return "gold";
        case "member":
            return "blue";
        case "viewer":
            return "default";
        default:
            return "default";
    }
}

export default function WorkspaceListPage() {
    const navigate = useNavigate();
    const [list, setList] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [form] = Form.useForm<{ name: string }>();

    const loadWorkspaces = async () => {
        setLoading(true);
        try {
            const data = await getWorkspaces();
            setList(data || []);
        } catch {
            // request.ts 已统一提示错误
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadWorkspaces();
    }, []);

    const handleCreate = async () => {
        try {
            const values = await form.validateFields();

            setCreateLoading(true);

            const workspace = await createWorkspace({
                name: values.name.trim(),
            });

            message.success("创建空间成功");
            setCreateOpen(false);
            form.resetFields();

            await loadWorkspaces();

            navigate(`/workspaces/${workspace.id}`);
        } catch (err) {
            // validateFields 报错或接口报错都不需要额外处理
        } finally {
            setCreateLoading(false);
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
                        我的协作空间
                    </Title>
                    <Text type="secondary">
                        管理你的团队空间、项目记录、任务提醒和成员协作。
                    </Text>
                </div>

                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setCreateOpen(true)}
                >
                    创建空间
                </Button>
            </Space>

            {list.length === 0 && !loading ? (
                <Card>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="还没有协作空间"
                    >
                        <Button type="primary" onClick={() => setCreateOpen(true)}>
                            创建第一个空间
                        </Button>
                    </Empty>
                </Card>
            ) : (
                <Row gutter={[16, 16]}>
                    {list.map((item) => (
                        <Col xs={24} sm={24} md={12} lg={8} xl={6} key={item.id}>
                            <Card
                                loading={loading}
                                hoverable
                                title={
                                    <Space>
                                        <TeamOutlined />
                                        <span>{item.name}</span>
                                    </Space>
                                }
                                extra={
                                    <Tag color={roleColor(item.role)}>{roleText(item.role)}</Tag>
                                }
                                actions={[
                                    <Button
                                        type="link"
                                        icon={<ArrowRightOutlined />}
                                        onClick={() => navigate(`/workspaces/${item.id}`)}
                                    >
                                        进入空间
                                    </Button>,
                                    <Button
                                        type="link"
                                        onClick={() => navigate(`/workspaces/${item.id}/members`)}
                                    >
                                        成员管理
                                    </Button>,
                                ]}
                            >
                                <Space direction="vertical" size={8}>
                                    <Text type="secondary">空间 ID：{item.id}</Text>
                                    <Text type="secondary">
                                        创建时间：
                                        {item.created_at
                                            ? dayjs(item.created_at).format("YYYY-MM-DD HH:mm")
                                            : "-"}
                                    </Text>
                                    <Text type="secondary">
                                        更新时间：
                                        {item.updated_at
                                            ? dayjs(item.updated_at).format("YYYY-MM-DD HH:mm")
                                            : "-"}
                                    </Text>
                                </Space>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}

            <Modal
                title="创建协作空间"
                open={createOpen}
                onCancel={() => {
                    setCreateOpen(false);
                    form.resetFields();
                }}
                onOk={handleCreate}
                confirmLoading={createLoading}
                okText="创建"
                cancelText="取消"
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="空间名称"
                        name="name"
                        rules={[
                            { required: true, message: "请输入空间名称" },
                            { max: 128, message: "空间名称不能超过 128 个字符" },
                        ]}
                    >
                        <Input placeholder="例如：轻记协同开发组" allowClear />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
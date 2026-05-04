import { Button, Card, Form, Input, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../../api/auth";

export default function RegisterPage() {
    const navigate = useNavigate();

    const onFinish = async (values: {
        username: string;
        email: string;
        password: string;
        confirmPassword: string;
    }) => {
        if (values.password !== values.confirmPassword) {
            message.error("两次密码不一致");
            return;
        }

        try {
            await register({
                username: values.username,
                email: values.email,
                password: values.password,
            });

            message.success("注册成功，请登录");
            navigate("/login");
        } catch {
            // 错误已由 request.ts 统一提示
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                background: "#f5f5f5",
            }}
        >
            <Card title="轻记协同 - 注册" style={{ width: 380 }}>
                <Form layout="vertical" onFinish={onFinish}>
                    <Form.Item
                        label="用户名"
                        name="username"
                        rules={[{ required: true, message: "请输入用户名" }]}
                    >
                        <Input placeholder="请输入用户名" />
                    </Form.Item>

                    <Form.Item
                        label="邮箱"
                        name="email"
                        rules={[
                            { required: true, message: "请输入邮箱" },
                            { type: "email", message: "邮箱格式不正确" },
                        ]}
                    >
                        <Input placeholder="请输入邮箱" />
                    </Form.Item>

                    <Form.Item
                        label="密码"
                        name="password"
                        rules={[{ required: true, message: "请输入密码" }]}
                    >
                        <Input.Password placeholder="请输入密码" />
                    </Form.Item>

                    <Form.Item
                        label="确认密码"
                        name="confirmPassword"
                        rules={[{ required: true, message: "请再次输入密码" }]}
                    >
                        <Input.Password placeholder="请再次输入密码" />
                    </Form.Item>

                    <Button type="primary" htmlType="submit" block>
                        注册
                    </Button>

                    <div style={{ marginTop: 16, textAlign: "center" }}>
                        已有账号？<Link to="/login">去登录</Link>
                    </div>
                </Form>
            </Card>
        </div>
    );
}
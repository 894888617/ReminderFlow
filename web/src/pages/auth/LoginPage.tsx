import { Button, Card, Form, Input, message } from "antd";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../../api/auth";

export default function LoginPage() {
    const navigate = useNavigate();

    const onFinish = async (values: { username: string; password: string }) => {
        try {
            const res = await login(values);
            localStorage.setItem("token", res.token);
            message.success("登录成功");
            navigate("/dashboard");
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
            <Card title="轻记协同 - 登录" style={{ width: 380 }}>
                <Form layout="vertical" onFinish={onFinish}>
                    <Form.Item
                        label="用户名"
                        name="username"
                        rules={[{ required: true, message: "请输入用户名" }]}
                    >
                        <Input placeholder="请输入用户名" />
                    </Form.Item>

                    <Form.Item
                        label="密码"
                        name="password"
                        rules={[{ required: true, message: "请输入密码" }]}
                    >
                        <Input.Password placeholder="请输入密码" />
                    </Form.Item>

                    <Button type="primary" htmlType="submit" block>
                        登录
                    </Button>

                    <div style={{ marginTop: 16, textAlign: "center" }}>
                        没有账号？<Link to="/register">去注册</Link>
                    </div>
                </Form>
            </Card>
        </div>
    );
}
import { Space, Typography } from "antd";
import type { ReactNode } from "react";

const { Title, Text } = Typography;

interface Props {
    title: string;
    description?: string;
    extra?: ReactNode;
}

export default function PageHeader({ title, description, extra }: Props) {
    return (
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
                    {title}
                </Title>
                {description && <Text type="secondary">{description}</Text>}
            </div>

            {extra}
        </Space>
    );
}
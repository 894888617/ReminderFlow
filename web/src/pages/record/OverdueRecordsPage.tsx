import { useEffect, useState } from "react";
import { Button, Card, Empty, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { getOverdueRecords, updateRecordStatus } from "../../api/record";
import type { RecordItem, RecordStatus } from "../../types/record";
import { recordStatusColor, recordStatusText } from "../../utils/recordStatus";

const { Title, Text } = Typography;



export default function OverdueRecordsPage() {
    const navigate = useNavigate();

    const [list, setList] = useState<RecordItem[]>([]);
    const [loading, setLoading] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getOverdueRecords();
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

    const handleDone = async (record: RecordItem) => {
        await updateRecordStatus(record.id, "COMPLETED");
        await loadData();
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
            render: (status: RecordStatus) => (
                <Tag color={recordStatusColor(status)}>{recordStatusText(status)}</Tag>
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
            title: "操作",
            key: "action",
            width: 180,
            render: (_, record) => (
                <Space>
                    <Button size="small" onClick={() => navigate(`/records/${record.id}`)}>
                        详情
                    </Button>
                    <Button size="small" type="primary" onClick={() => handleDone(record)}>
                        标记完成
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
            >
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>
                        逾期任务
                    </Title>
                    <Text type="secondary">查看当前登录用户负责的逾期任务。</Text>
                </div>

                <Button icon={<ReloadOutlined />} onClick={loadData}>
                    刷新
                </Button>
            </Space>

            <Card>
                {list.length === 0 && !loading ? (
                    <Empty description="暂无逾期任务" />
                ) : (
                    <Table
                        rowKey="id"
                        loading={loading}
                        columns={columns}
                        dataSource={list}
                        pagination={{
                            pageSize: 10,
                            showTotal: (total) => `共 ${total} 条`,
                        }}
                    />
                )}
            </Card>
        </div>
    );
}
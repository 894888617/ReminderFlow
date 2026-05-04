import { Empty } from "antd";

interface Props {
    description?: string;
}

export default function AppEmpty({ description = "暂无数据" }: Props) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />;
}
import { View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";

import { getRecords, type RecordItem } from "../../api/record";

import "./index.scss";

function formatDateTime(value?: string | null) {
  if (!value) return "未设置";
  return value.replace("T", " ").slice(0, 16);
}

export default function CustomerHistoryPage() {
  const router = useRouter();
  const keyword = String(router.params.keyword || "");
  const calendarId = Number(
    router.params.calendar_id || router.params.workspace_id || 0,
  );
  const [items, setItems] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!calendarId || !keyword) return;
    try {
      setLoading(true);
      const data = await getRecords({
        workspace_id: calendarId,
        keyword,
        page: 1,
        page_size: 20,
      });
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    loadData();
  });

  return (
    <View className="container">
      {loading ? <View className="empty-box">加载中...</View> : null}

      {!loading && items.length === 0 ? (
        <View className="empty-box">暂无历史预约记录</View>
      ) : null}

      {items.map((item) => (
        <View
          key={item.id}
          className="history-card"
          onClick={() =>
            Taro.navigateTo({ url: `/pages/record-detail/index?id=${item.id}` })
          }
        >
          <View className="history-title">{item.title}</View>
          <View className="history-meta">
            状态：{item.status} ｜ 负责人：{item.assignee_name || "未分配"}
          </View>
          <View className="history-meta">
            预约 / 截止：{formatDateTime(item.due_at)}
          </View>
          {item.content ? (
            <View className="history-content">{item.content}</View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

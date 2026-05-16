import { View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";

import { getRecords, type RecordItem } from "../../api/record";

import "./index.scss";

function formatDateTime(value?: string | null) {
  if (!value) return "未设置";
  return value.replace("T", " ").slice(0, 16);
}

function getAppointmentTime(item: RecordItem) {
  const start = item.calendar_start_at || item.due_at;
  const end = item.calendar_end_at;

  if (!start) return "未设置";

  const date = start.slice(0, 10);
  const startTime = start.slice(11, 16);

  if (item.calendar_all_day) return `${date} 全天`;
  if (end) return `${date} ${startTime} - ${end.slice(11, 16)}`;
  return formatDateTime(start);
}

export default function CustomerHistoryPage() {
  const router = useRouter();
  const keyword = String(router.params.keyword || "");
  const customerPhone = String(router.params.customer_phone || "");
  const customerName = String(router.params.customer_name || "");
  const calendarId = Number(
    router.params.calendar_id || router.params.workspace_id || 0,
  );
  const [items, setItems] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const fallbackKeyword = keyword || customerPhone || customerName;
    if (!calendarId || (!fallbackKeyword && !customerPhone && !customerName)) return;
    try {
      setLoading(true);
      const data = await getRecords({
        workspace_id: calendarId,
        keyword: keyword || undefined,
        customer_phone: customerPhone || undefined,
        customer_name: customerName || undefined,
        page: 1,
        page_size: 50,
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
      <View className="history-head">
        <View className="history-title">客户历史</View>
        <View className="history-meta">客户姓名：{customerName || "未提供"}</View>
        <View className="history-meta">客户手机号：{customerPhone || "未提供"}</View>
        <View className="history-meta">历史预约次数：{items.length}</View>
      </View>

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
            客户：{item.customer_name || "-"} ｜ 电话：{item.customer_phone || "-"}
          </View>
          <View className="history-meta">服务项目：{item.service_name || "-"}</View>
          <View className="history-meta">
            预约时间：{getAppointmentTime(item)}
          </View>
          <View className="history-meta">
            状态：{item.status} ｜ 负责人：{item.assignee_name || "未分配"}
          </View>
          {item.content ? (
            <View className="history-content">{item.content}</View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

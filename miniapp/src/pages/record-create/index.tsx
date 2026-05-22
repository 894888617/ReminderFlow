import { View, Text, Input, Textarea, Picker, Checkbox, CheckboxGroup, Button } from "@tarojs/components";
import ProjectSelect from "../../components/ProjectSelect";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";

import {
  listCalendarMembers,
  listCalendars,
  normalizeCalendarRole,
  type Calendar,
  type CalendarMember,
} from "../../api/calendar";
import { createRecord } from "../../api/record";
import { canCreateRecord } from "../../utils/permission";

import { getStoredToken, getStoredUser } from "../../utils/auth";
import { getUserNameDisplay } from "../../utils/userDisplay";
import {
  returnToCalendar,
  saveCalendarReturnContext,
} from "../../utils/calendarReturn";
import "./index.scss";

const DEFAULT_STATUS = "pending";

function buildDateTime(date: string, time = "00:00") {
  if (!date) return undefined;
  return `${date}T${time || "00:00"}:00+08:00`;
}

function todayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// function currentTime() {
//   const d = new Date()
//   const hh = String(d.getHours()).padStart(2, '0')
//   const mm = String(d.getMinutes()).padStart(2, '0')
//   return `${hh}:${mm}`
// }

export default function RecordCreatePage() {
  const router = useRouter();

  const routeCalendarId = Number(
    router.params.calendar_id || 0,
  );
  const selectedDate = String(router.params.selected_date || "");
  const currentDate = String(router.params.current_date || selectedDate || "");
  const currentUser = getStoredUser();
  const defaultAppointmentDate = selectedDate || todayDate();

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<number>(routeCalendarId || 0);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [assigneeId, setAssigneeId] = useState<number | undefined>();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [saveToCustomer, setSaveToCustomer] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(defaultAppointmentDate);
  const [startTime, setStartTime] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const memberOptions = useMemo(() => {
    return members.map((item) => ({
      label: getUserNameDisplay(item),
      value: item.user_id,
    }));
  }, [members]);

  const selectedAssigneeIndex = useMemo(() => {
    if (!assigneeId) return -1;
    return memberOptions.findIndex((item) => item.value === assigneeId);
  }, [memberOptions, assigneeId]);

  const selectedAssigneeName = useMemo(() => {
    if (!assigneeId) return "选择负责人";

    const selected = memberOptions.find((item) => item.value === assigneeId);
    return selected?.label || "选择负责人";
  }, [memberOptions, assigneeId]);

  const loadCalendars = async () => {
    const token = getStoredToken();

    if (!token) {
      Taro.redirectTo({
        url: "/pages/login/index",
      });
      return;
    }

    try {
      const data = await listCalendars();
      const writableCalendars = (data || []).filter((item) =>
        canCreateRecord(normalizeCalendarRole(item)),
      );

      setCalendars(writableCalendars);

      if (routeCalendarId) {
        const target = writableCalendars.find(
          (item) => item.id === routeCalendarId,
        );

        if (target) {
          setCalendarId(target.id);
          return;
        }

        Taro.showToast({
          title: "当前日历无创建权限",
          icon: "none",
        });
      }

      if (!calendarId && writableCalendars.length > 0) {
        setCalendarId(writableCalendars[0].id);
      }

      if (calendarId) {
        const current = writableCalendars.find(
          (item) => item.id === calendarId,
        );

        if (!current) {
          setCalendarId(writableCalendars[0]?.id || 0);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useDidShow(() => {
    loadCalendars();

    const selectedCustomer = Taro.getStorageSync("record_selected_customer");

    if (selectedCustomer) {
      const selectedCustomerId =
        Number(selectedCustomer.id || selectedCustomer.customer_id || 0) ||
        undefined;
      const selectedCustomerName = String(
        selectedCustomer.name || selectedCustomer.customer_name || "",
      );
      const selectedCustomerPhone = String(
        selectedCustomer.phone || selectedCustomer.customer_phone || "",
      );

      setCustomerId(selectedCustomerId);
      setCustomerName(selectedCustomerName);
      setCustomerPhone(selectedCustomerPhone);
      setSaveToCustomer(false);

      if (!title.trim()) {
        const nextTitle = [selectedCustomerName.trim(), serviceName.trim()]
          .filter(Boolean)
          .join(" ");
        if (nextTitle) {
          setTitle(nextTitle);
        }
      }

      Taro.removeStorageSync("record_selected_customer");
    }
  });

  useEffect(() => {
    if (!calendarId) {
      setMembers([]);
      setAssigneeId(undefined);
      return;
    }

    let active = true;

    listCalendarMembers(calendarId)
      .then((data) => {
        if (!active) return;

        const items = data || [];

        setMembers(items);

        setAssigneeId((current) => {
          if (current && items.some((item) => item.user_id === current)) {
            return current;
          }

          if (
            currentUser?.id &&
            items.some((item) => item.user_id === currentUser.id)
          ) {
            return currentUser.id;
          }

          return undefined;
        });
      })
      .catch((err) => {
        console.error(err);

        if (active) {
          setMembers([]);
          setAssigneeId(undefined);
        }
      });

    return () => {
      active = false;
    };
  }, [calendarId]);

  const handleSubmit = async () => {
    if (submitting) return;

    if (calendars.length === 0) {
      Taro.showToast({
        title: "暂无可创建记录的日历",
        icon: "none",
      });
      return;
    }

    if (!calendarId) {
      Taro.showToast({
        title: "请先选择日历",
        icon: "none",
      });
      return;
    }

    const finalTitle =
      title.trim() ||
      [customerName.trim(), serviceName.trim()].filter(Boolean).join(" ") ||
      "预约记录";

    const finalAppointmentDate = appointmentDate || defaultAppointmentDate;
    const finalStartTime = startTime.trim();
    const calendarStartAt = buildDateTime(finalAppointmentDate, finalStartTime);
    const calendarAllDay = !finalStartTime;

    const buildPayload = (overrides?: Partial<any>) => ({
      calendar_id: calendarId,
      title: finalTitle,
      content: content.trim(),
      assignee_id: assigneeId,
      due_at: calendarStartAt,
      start_time: calendarStartAt,
      end_time: null,
      status: DEFAULT_STATUS,
      calendar_start_at: calendarStartAt,
      calendar_all_day: calendarAllDay,
      appointment_status: DEFAULT_STATUS,
      customer_id: customerId ?? null,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_remark: null,
      save_customer_to_library: customerId ? false : saveToCustomer,
      project_id: projectId,
      project_name: serviceName.trim(),
      ...overrides,
    });
    try {
      setSubmitting(true);

      Taro.showLoading({
        title: "保存中...",
        mask: true,
      });

      const payload = buildPayload();

      if (process.env.NODE_ENV === 'development') {
        console.log('create record payload', payload);
      }

      await createRecord(payload);

      Taro.showToast({
        title: "创建成功",
        icon: "success",
      });

      saveCalendarReturnContext({
        currentCalendarId: calendarId,
        current_calendar_id: calendarId,
        calendar_id: calendarId,
        current_date: currentDate || finalAppointmentDate,
        selected_date: finalAppointmentDate,
      });

      setTimeout(() => {
        returnToCalendar({
          currentCalendarId: calendarId,
          currentDate: currentDate || finalAppointmentDate,
          selectedDate: finalAppointmentDate,
        });
      }, 300);
    } catch (err: any) {
      console.error(err);

      if (err?.code === "SCHEDULE_CONFLICT") {
        Taro.showToast({
          title: "该时间段已有安排，请调整时间",
          icon: "none",
        });
      } else if (err?.code === 'CUSTOMER_PHONE_EXISTS') {
        Taro.hideLoading();
        const customer = err?.customer || {};
        const modal = await Taro.showModal({ title: '手机号重复', content: '该手机号客户已存在，是否使用已有客户信息？', confirmText: '使用已有客户', cancelText: '不使用' });
        if (!modal.confirm && !modal.cancel) {
          return;
        }

        const useExisting = !!modal.confirm;
        const existingCustomerId = Number(customer.id || 0) || undefined;
        const retryPayload = useExisting
          ? buildPayload({
            customer_id: existingCustomerId ?? null,
            customer_name: customer.name || customerName.trim(),
            customer_phone: customer.phone || customerPhone.trim(),
            customer_remark: null,
            save_customer_to_library: false,
          })
          : buildPayload({
            customer_id: null,
            save_customer_to_library: false,
          });

        if (process.env.NODE_ENV === 'development') {
          console.log('create record payload', retryPayload);
        }

        Taro.showLoading({ title: "保存中...", mask: true });
        await createRecord(retryPayload);

        if (useExisting) {
          setCustomerId(existingCustomerId);
          setCustomerName(customer.name || customerName);
          setCustomerPhone(customer.phone || customerPhone);
        } else {
          setCustomerId(undefined);
        }
        setSaveToCustomer(false);

        Taro.showToast({ title: "创建成功", icon: "success" });
        saveCalendarReturnContext({
          currentCalendarId: calendarId,
          current_calendar_id: calendarId,
          calendar_id: calendarId,
          current_date: currentDate || finalAppointmentDate,
          selected_date: finalAppointmentDate,
        });
        setTimeout(() => {
          returnToCalendar({
            currentCalendarId: calendarId,
            currentDate: currentDate || finalAppointmentDate,
            selectedDate: finalAppointmentDate,
          });
        }, 300);
        return;
      } else {
        Taro.showToast({ title: '创建预约失败，请稍后重试', icon: 'none' });
      }
    } finally {
      Taro.hideLoading();
      setSubmitting(false);
    }
  };

  return (
    <View className="record-form-page">
      <View className="record-form-card">
        {calendars.length === 0 ? (
          <View className="form-item">
            <View className="empty-calendar-guide">
              <View className="empty-calendar-title">暂无可创建记录的日历</View>
              <View className="empty-calendar-desc">
                你需要先创建一个日历，或者加入有创建权限的日历，才能添加记录。
              </View>
              <View className="empty-calendar-btn" onClick={() => Taro.navigateTo({ url: "/pages/calendar-create/index" })}>去创建日历</View>
            </View>
          </View>
        ) : null}

        <View className="record-title-row">
          <Text className="form-label no-margin">标题</Text>
          <View className="customer-file-btn" onClick={() => {
            if (!calendarId) { Taro.showToast({ title: '请先选择日历', icon: 'none' }); return }
            const url = `/pages/customer/select?calendar_id=${calendarId}`
            Taro.navigateTo({ url })
          }}>客户档案</View>
        </View>

        <View className="form-item">
          <Input className="form-input" value={title} placeholder="可留空自动生成 客户姓名 + 服务项目" maxlength={200} onInput={(e) => setTitle(e.detail.value)} />
        </View>

        <View className="form-row two-col">
          <View className="form-col">
            <View className="form-item compact-item"><Text className="form-label">姓名</Text><Input className="form-input" value={customerName} maxlength={128} onInput={(e) => setCustomerName(e.detail.value)} /></View>
          </View>
          <View className="form-col">
            <View className="form-item compact-item"><Text className="form-label">手机号</Text><Input className="form-input" value={customerPhone} maxlength={32} onInput={(e) => setCustomerPhone(e.detail.value)} /></View>
          </View>
        </View>

        <View className="form-row two-col">
          <View className="form-col">
            <View className="form-item compact-item"><Text className="form-label">项目</Text><Input className="form-input" value={serviceName} maxlength={128} onInput={(e) => setServiceName(e.detail.value)} /></View>
          </View>
          <View className="form-col">
            <View className="form-item compact-item"><Text className="form-label">负责人</Text><View className="assignee-box-wrap">
            {memberOptions.length === 0 ? (
              <View className="assignee-select-box placeholder">暂无成员可选</View>
            ) : (
              <Picker mode="selector" range={memberOptions.map((item) => item.label)} value={selectedAssigneeIndex >= 0 ? selectedAssigneeIndex : 0} onChange={(e) => {
                const index = Number(e.detail.value);
                const selected = memberOptions[index];
                if (selected) setAssigneeId(selected.value);
              }}><View className={assigneeId ? "assignee-select-box" : "assignee-select-box placeholder"}>{selectedAssigneeName}</View></Picker>
            )}
            {assigneeId ? <View className="assignee-clear" onClick={() => setAssigneeId(undefined)}>×</View> : null}
          </View></View>
          </View>
        </View>

        {customerId ? null : <View className="save-customer-row"><CheckboxGroup onChange={(e) => setSaveToCustomer((e.detail.value || []).includes('1'))}><Checkbox value='1' checked={saveToCustomer}>保存到客户库</Checkbox></CheckboxGroup></View>}

        <View className="form-row two-col">
          <View className="form-item compact-item"><Text className="form-label">预约日期</Text><Picker mode="date" value={appointmentDate} onChange={(e) => setAppointmentDate(String(e.detail.value))}><View className="datetime-picker">{appointmentDate}</View></Picker></View>
          <View className="form-item compact-item"><Text className="form-label">开始时间（可选）</Text><Picker mode="time" value={startTime || "10:00"} onChange={(e) => setStartTime(String(e.detail.value))}><View className="datetime-picker">{startTime || "选择开始时间"}</View></Picker>{startTime ? (<View className="clear-link" onClick={() => setStartTime("")}>清除开始时间</View>) : null}</View>
        </View>

        <View className="form-item">
          <Text className="form-label">备注</Text>
          <Textarea className="form-textarea" value={content} maxlength={1000} onInput={(e) => setContent(e.detail.value)} />
        </View>
      </View>

      <View className="record-submit-bar">
        <Button className="record-submit-btn" disabled={submitting || calendars.length === 0} onClick={handleSubmit}>
          {submitting ? "创建中..." : "创建预约"}
        </Button>
      </View>
    </View>
  );
}

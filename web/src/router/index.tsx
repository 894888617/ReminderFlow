import { createBrowserRouter, Navigate } from "react-router-dom";

import AuthLayout from "../layouts/AuthLayout";

import LoginPage from "../pages/auth/LoginPage";
import RegisterPage from "../pages/auth/RegisterPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import WorkspaceListPage from "../pages/workspace/WorkspaceListPage";
import WorkspaceDetailPage from "../pages/workspace/WorkspaceDetailPage";
import WorkspaceMembersPage from "../pages/workspace/WorkspaceMembersPage";
import RecordDetailPage from "../pages/record/RecordDetailPage";
import OverdueRecordsPage from "../pages/record/OverdueRecordsPage";
import TodayTodoPage from "../pages/todo/TodayTodoPage";
import NotificationPage from "../pages/notification/NotificationPage";
import SettingsPage from "../pages/settings/SettingsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
    const token = localStorage.getItem("token");

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

export const router = createBrowserRouter([
    {
        path: "/login",
        element: <LoginPage />,
    },
    {
        path: "/register",
        element: <RegisterPage />,
    },
    {
        path: "/",
        element: (
            <RequireAuth>
                <AuthLayout />
            </RequireAuth>
        ),
        children: [
            {
                index: true,
                element: <Navigate to="/dashboard" replace />,
            },
            {
                path: "dashboard",
                element: <DashboardPage />,
            },
            {
                path: "todos/today",
                element: <TodayTodoPage />,
            },
            {
                path: "workspaces",
                element: <WorkspaceListPage />,
            },
            {
                path: "workspaces/:id",
                element: <WorkspaceDetailPage />,
            },
            {
                path: "workspaces/:id/members",
                element: <WorkspaceMembersPage />,
            },
            {
                path: "records/overdue",
                element: <OverdueRecordsPage />,
            },
            {
                path: "records/:id",
                element: <RecordDetailPage />,
            },
            {
                path: "notifications",
                element: <NotificationPage />,
            },
            {
                path: "settings",
                element: <SettingsPage />,
            },
        ],
    },
]);
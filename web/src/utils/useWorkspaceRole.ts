import { useEffect, useState } from "react";
import { getWorkspaces } from "../api/workspace";
import type { WorkspaceRole } from "../types/workspace";

export function useWorkspaceRole(workspaceId?: number) {
    const [role, setRole] = useState<WorkspaceRole | undefined>();
    const [loading, setLoading] = useState(false);

    const loadRole = async () => {
        if (!workspaceId) return;

        setLoading(true);
        try {
            const list = await getWorkspaces();
            const current = list.find((item) => item.id === workspaceId);
            setRole(current?.role);
        } catch {
            setRole(undefined);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRole();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId]);

    return {
        role,
        loading,
        reload: loadRole,
    };
}
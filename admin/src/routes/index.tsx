import { createRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchReservations,
  updateReservationStatus,
  deleteReservation,
  type Reservation,
  type ReservationStatus,
} from "@/api/reservations";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, RefreshCw } from "lucide-react";
import { Route as rootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ReservationsPage,
});

const statusLabels: Record<ReservationStatus, string> = {
  not_visited: "未来院",
  checked_in: "受付済",
  in_consultation: "診察中",
  consultation_done: "診察終了",
  paid: "会計済",
  cancelled: "キャンセル",
};

const statusColors: Record<ReservationStatus, string> = {
  not_visited: "bg-blue-100 text-blue-800",
  checked_in: "bg-yellow-100 text-yellow-800",
  in_consultation: "bg-orange-100 text-orange-800",
  consultation_done: "bg-green-100 text-green-800",
  paid: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

function ReservationsPage() {
  const queryClient = useQueryClient();

  const {
    data: reservations,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["reservations"],
    queryFn: fetchReservations,
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ReservationStatus }) =>
      updateReservationStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteReservation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
  });

  const handleStatusChange = (id: number, status: ReservationStatus) => {
    updateMutation.mutate({ id, status });
  };

  const handleDelete = (id: number) => {
    if (window.confirm("この予約を削除しますか？")) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">読み込み中...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        エラー: {(error as Error).message}
        <br />
        <Button onClick={() => refetch()} className="mt-4">
          再試行
        </Button>
      </div>
    );
  }

  const todayReservations =
    reservations?.filter(
      (r) => r.date === new Date().toISOString().split("T")[0]
    ) ?? [];

  const statusCounts = {
    not_visited: reservations?.filter((r) => r.status === "not_visited").length ?? 0,
    checked_in: reservations?.filter((r) => r.status === "checked_in").length ?? 0,
    in_consultation: reservations?.filter((r) => r.status === "in_consultation").length ?? 0,
    consultation_done: reservations?.filter((r) => r.status === "consultation_done").length ?? 0,
    paid: reservations?.filter((r) => r.status === "paid").length ?? 0,
    cancelled: reservations?.filter((r) => r.status === "cancelled").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              全予約数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reservations?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              本日の予約
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayReservations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              未来院
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {statusCounts.not_visited}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              受付済
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {statusCounts.checked_in}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              診察中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {statusCounts.in_consultation}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              診察終了
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statusCounts.consultation_done}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              会計済
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {statusCounts.paid}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              キャンセル
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {statusCounts.cancelled}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>予約一覧</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            更新
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日時</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>お名前</TableHead>
                <TableHead>性別/生年月日</TableHead>
                <TableHead>連絡先</TableHead>
                <TableHead>症状</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations?.map((reservation) => (
                <ReservationRow
                  key={reservation.id}
                  reservation={reservation}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  isUpdating={updateMutation.isPending}
                />
              ))}
              {reservations?.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    予約がありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

const genderLabels: Record<string, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

const visitTypeLabels: Record<string, string> = {
  first: "初診",
  return: "再診",
};

function ReservationRow({
  reservation,
  onStatusChange,
  onDelete,
  isUpdating,
}: {
  reservation: Reservation;
  onStatusChange: (id: number, status: ReservationStatus) => void;
  onDelete: (id: number) => void;
  isUpdating: boolean;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium">{reservation.date}</div>
          <div className="text-muted-foreground">{reservation.time}〜</div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={reservation.visit_type === "first" ? "default" : "secondary"}>
          {reservation.visit_type ? visitTypeLabels[reservation.visit_type] : "-"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium">{reservation.name}</div>
          <div className="text-muted-foreground text-xs">
            {reservation.name_kana || ""}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div>{reservation.gender ? genderLabels[reservation.gender] : "-"}</div>
          <div className="text-muted-foreground text-xs">
            {reservation.birthdate || "-"}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div>{reservation.phone}</div>
          <div className="text-muted-foreground text-xs truncate max-w-[150px]">
            {reservation.email || "-"}
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[150px] truncate text-sm">
        {reservation.symptoms || "-"}
      </TableCell>
      <TableCell>
        <Select
          value={reservation.status}
          onValueChange={(value: string) =>
            onStatusChange(reservation.id, value as ReservationStatus)
          }
          disabled={isUpdating}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue>
              <Badge className={statusColors[reservation.status]}>
                {statusLabels[reservation.status]}
              </Badge>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_visited">未来院</SelectItem>
            <SelectItem value="checked_in">受付済</SelectItem>
            <SelectItem value="in_consultation">診察中</SelectItem>
            <SelectItem value="consultation_done">診察終了</SelectItem>
            <SelectItem value="paid">会計済</SelectItem>
            <SelectItem value="cancelled">キャンセル</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(reservation.id)}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

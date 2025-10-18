import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const transactions = [
    { id: 'TRX001', date: '2023-12-01', amount: 49.00, method: 'Visa **** 4242', status: 'Paid' },
    { id: 'TRX002', date: '2023-11-01', amount: 19.99, method: 'PayPal', status: 'Paid' },
    { id: 'TRX003', date: '2023-10-01', amount: 49.00, method: 'Visa **** 4242', status: 'Paid' },
    { id: 'TRX004', date: '2023-09-01', amount: 19.99, method: 'Visa **** 4242', status: 'Paid' },
    { id: 'TRX005', date: '2023-08-01', amount: 49.00, method: 'PayPal', status: 'Paid' },
    { id: 'TRX006', date: '2023-07-01', amount: 19.99, method: 'Visa **** 4242', status: 'Failed' },
    { id: 'TRX007', date: '2023-06-01', amount: 49.00, method: 'Visa **** 4242', status: 'Paid' },
    { id: 'TRX008', date: '2023-05-01', amount: 19.99, method: 'PayPal', status: 'Paid' },
];

const statusVariant = (status: string) => {
    switch (status) {
        case 'Paid':
            return 'default';
        case 'Failed':
            return 'destructive';
        default:
            return 'secondary';
    }
}

export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold font-headline tracking-tight">
          Payment History
        </h1>
        <p className="text-muted-foreground">
          View and manage your past transactions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            A complete list of your payment history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">{transaction.id}</TableCell>
                  <TableCell>{transaction.date}</TableCell>
                  <TableCell>{transaction.method}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(transaction.status) as any}>{transaction.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">${transaction.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

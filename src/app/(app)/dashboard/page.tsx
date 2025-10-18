import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const recentTransactions = [
  {
    description: 'Pro Plan Subscription',
    amount: '+$49.00',
    date: 'Dec 1, 2023',
  },
  {
    description: 'Basic Plan Subscription',
    amount: '+$19.00',
    date: 'Nov 1, 2023',
  },
  {
    description: 'Pro Plan Subscription',
    amount: '+$49.00',
    date: 'Oct 1, 2023',
  },
  {
    description: 'Basic Plan Subscription',
    amount: '+$19.00',
    date: 'Sep 1, 2023',
  },
];

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold font-headline tracking-tight">
          Welcome back, John!
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s a summary of your account.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Current Subscription
            </CardTitle>
            <Badge variant="default" className="bg-primary/80">Pro Plan</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$49/month</div>
            <p className="text-xs text-muted-foreground">
              Your next payment is on Jan 1, 2024.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$634.00</div>
            <p className="text-xs text-muted-foreground">
              Across 12 transactions since joining.
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Visa **** 4242</div>
            <p className="text-xs text-muted-foreground">
              Expires 12/25.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center">
          <div className="grid gap-2">
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>
              A quick look at your most recent payments.
            </CardDescription>
          </div>
          <Button asChild size="sm" className="ml-auto gap-1">
            <Link href="/history">
              View All
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.map((transaction, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    {transaction.description}
                  </TableCell>
                  <TableCell className="text-right">{transaction.amount}</TableCell>
                   <TableCell className="text-right">{transaction.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

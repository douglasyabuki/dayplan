-- CreateTable
CREATE TABLE "WorkspaceImport" (
    "userId" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceImport_pkey" PRIMARY KEY ("userId","snapshotHash")
);

-- AddForeignKey
ALTER TABLE "WorkspaceImport" ADD CONSTRAINT "WorkspaceImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

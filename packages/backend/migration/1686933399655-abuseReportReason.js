export class abuserReportReason1686933399655 {
    name = 'abuserReportReason1686933399655'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "abuse_user_report" ADD "reason" varchar NOT NULL DEFAULT 'abuseOther'`);
        await queryRunner.query(`CREATE INDEX "IDX_ccfcebc9f2622a3ab608b47d9a" ON "abuse_user_report" ("reason") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_ccfcebc9f2622a3ab608b47d9a`);
        await queryRunner.query(`ALTER TABLE "abuse_user_report" DROP COLUMN "reason"`);
    }
}

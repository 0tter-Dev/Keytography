using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Keytography.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVaultEntries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "VaultEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", nullable: false),
                    Login = table.Column<string>(type: "TEXT", nullable: true),
                    EncryptedPassword = table.Column<byte[]>(type: "BLOB", nullable: false),
                    AdditionalFieldsJson = table.Column<string>(type: "TEXT", nullable: true),
                    IsDeleted = table.Column<bool>(type: "INTEGER", nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VaultEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VaultEntries_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VaultKeys",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Argon2Salt = table.Column<byte[]>(type: "BLOB", nullable: false),
                    OwnerWrappedDek = table.Column<byte[]>(type: "BLOB", nullable: false),
                    RecoveryWrappedDek = table.Column<byte[]>(type: "BLOB", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VaultKeys", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_VaultKeys_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VaultEntryHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    VaultEntryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EncryptedPassword = table.Column<byte[]>(type: "BLOB", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VaultEntryHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VaultEntryHistories_VaultEntries_VaultEntryId",
                        column: x => x.VaultEntryId,
                        principalTable: "VaultEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VaultEntries_UserId_IsDeleted",
                table: "VaultEntries",
                columns: new[] { "UserId", "IsDeleted" });

            migrationBuilder.CreateIndex(
                name: "IX_VaultEntryHistories_VaultEntryId",
                table: "VaultEntryHistories",
                column: "VaultEntryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VaultEntryHistories");

            migrationBuilder.DropTable(
                name: "VaultKeys");

            migrationBuilder.DropTable(
                name: "VaultEntries");
        }
    }
}
